"""
Meetings pipeline — polls each sales manager's Google Drive folder for new
Meet recordings, transcribes them (AssemblyAI, speaker diarization), analyzes
with Claude, and saves them as conversations (type="meeting").

Triggered periodically by Cloud Scheduler hitting POST /api/meetings/poll.
"""
import os
import re
import tempfile
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Header
from fastapi.responses import StreamingResponse, RedirectResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask
from typing import Optional

from app.services.google_drive import list_recordings, download_recording, get_access_token, get_connected_account_email
from app.services import google_drive_oauth
from app.services.assemblyai_transcription import transcribe_meeting
from app.services.claude_analysis import analyze_transcript
from app.services.supabase_client import get_supabase
from app.services.talk_ratio import compute_manager_talk_pct
from app.core.config import settings

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("/stream/{conversation_id}")
async def stream_recording(conversation_id: str, range_header: Optional[str] = Header(None, alias="range")):
    """Proxies a meeting recording from Google Drive so the frontend <audio>/<video>
    player can use it directly — Drive's webViewLink is a share page, not playable
    media, and Drive requires an Authorization header <audio> can't send itself."""
    db = get_supabase()
    conv = db.table("conversations").select("google_drive_file_id").eq("id", conversation_id).execute()
    if not conv.data or not conv.data[0].get("google_drive_file_id"):
        raise HTTPException(status_code=404, detail="Recording not found")
    file_id = conv.data[0]["google_drive_file_id"]

    headers = {"Authorization": f"Bearer {get_access_token()}"}
    # Cloud Run's frontend proxy aborts a single response once it gets too large, so a
    # plain (no-Range) request for the whole multi-hundred-MB file fails with a 500.
    # Browsers normally send Range themselves once they know the file supports it, but
    # their very first request for <audio>/<video> is often a plain GET — bound it
    # ourselves so that first response always stays small.
    DEFAULT_INITIAL_RANGE = "bytes=0-10485759"  # first 10MB
    headers["Range"] = range_header or DEFAULT_INITIAL_RANGE

    drive_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
    client = httpx.AsyncClient(timeout=None)
    req = client.build_request("GET", drive_url, headers=headers)
    upstream = await client.send(req, stream=True)

    passthrough_headers = {}
    for h in ("content-range", "content-length", "accept-ranges", "content-type"):
        if h in upstream.headers:
            passthrough_headers[h] = upstream.headers[h]
    passthrough_headers.setdefault("accept-ranges", "bytes")

    async def cleanup():
        await upstream.aclose()
        await client.aclose()

    return StreamingResponse(
        upstream.aiter_bytes(),
        status_code=upstream.status_code,
        headers=passthrough_headers,
        background=BackgroundTask(cleanup),
    )


class DriveOAuthStartBody(BaseModel):
    manager_id: str


@router.post("/drive-oauth/start")
async def drive_oauth_start(payload: DriveOAuthStartBody, x_webhook_secret: Optional[str] = Header(None)):
    """Called server-side by the Next.js route (which already gated on owner/admin) to
    build the Google consent URL for one manager — the Next.js route then redirects the
    manager's browser there directly."""
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")
    if not settings.GOOGLE_DRIVE_WEB_CLIENT_ID or not settings.GOOGLE_DRIVE_WEB_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Google OAuth web client не налаштований")
    return {"url": google_drive_oauth.build_authorize_url(payload.manager_id)}


@router.get("/drive-oauth/callback")
async def drive_oauth_callback(code: str = "", state: str = "", error: str = ""):
    """Hit directly by the browser via Google's redirect — no auth header possible, so
    the signed `state` (see google_drive_oauth.verify_state) is the only thing stopping
    a forged callback from overwriting a different manager's stored token."""
    frontend_settings_url = f"{settings.FRONTEND_BASE_URL}/settings/integrations"
    if error:
        return RedirectResponse(f"{frontend_settings_url}?drive_oauth_error={error}")

    manager_id = google_drive_oauth.verify_state(state)
    if not manager_id:
        return RedirectResponse(f"{frontend_settings_url}?drive_oauth_error=invalid_state")

    try:
        tokens = await google_drive_oauth.exchange_code(code)
        refresh_token = tokens.get("refresh_token")
        if not refresh_token:
            # Google only issues a refresh_token on first-ever consent for this
            # client+account pair — if the manager somehow reaches here without one
            # (shouldn't happen given prompt=consent), there's nothing useful to store.
            return RedirectResponse(f"{frontend_settings_url}?drive_oauth_error=no_refresh_token")
        email = await google_drive_oauth.get_email(tokens.get("access_token", ""))
    except Exception as e:
        print(f"[meetings] drive-oauth callback failed for manager {manager_id}: {e}")
        return RedirectResponse(f"{frontend_settings_url}?drive_oauth_error=exchange_failed")

    db = get_supabase()
    db.table("manager_drive_tokens").upsert({
        "manager_id": manager_id,
        "refresh_token": refresh_token,
        "google_email": email,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="manager_id").execute()

    return RedirectResponse(f"{frontend_settings_url}?drive_connected=1")


@router.get("/drive-oauth/status")
async def drive_oauth_status(x_webhook_secret: Optional[str] = Header(None)):
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")
    db = get_supabase()
    rows = db.table("manager_drive_tokens").select("manager_id, google_email, connected_at").execute()
    return {"connections": rows.data or []}


class DriveOAuthDisconnectBody(BaseModel):
    manager_id: str


@router.post("/drive-oauth/disconnect")
async def drive_oauth_disconnect(payload: DriveOAuthDisconnectBody, x_webhook_secret: Optional[str] = Header(None)):
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")
    db = get_supabase()
    db.table("manager_drive_tokens").delete().eq("manager_id", payload.manager_id).execute()
    return {"ok": True}


@router.get("/drive-account")
async def drive_account():
    """The Google account a manager's folder must be shared with — surfaced in
    Settings so admins know exactly who to grant access to when adding a folder."""
    try:
        return {"email": get_connected_account_email()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Google Drive: {e}")


class ManualMeetingBody(BaseModel):
    url: str
    manager_id: str
    client_name: str
    date: Optional[str] = None


DRIVE_FILE_ID_PATTERNS = (
    re.compile(r"/file/d/([a-zA-Z0-9_-]+)"),
    re.compile(r"[?&]id=([a-zA-Z0-9_-]+)"),
)


def extract_drive_file_id(url: str) -> str | None:
    for pattern in DRIVE_FILE_ID_PATTERNS:
        m = pattern.search(url)
        if m:
            return m.group(1)
    return None


@router.post("/retry/{conversation_id}")
async def retry_meeting(
    conversation_id: str,
    background_tasks: BackgroundTasks,
    x_webhook_secret: Optional[str] = Header(None),
):
    """Retries the FULL pipeline (re-download + re-transcribe + re-analyze) for a
    meeting that failed before ever getting a transcript saved — e.g. a network
    timeout mid-download/mid-upload. The frontend's generic "Повторний аналіз" only
    re-runs Claude analysis against an already-saved transcript, so it 400s uselessly
    for exactly this case (no transcript exists yet); this is what that button falls
    back to when it detects a meeting with no transcript and no VTT."""
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    db = get_supabase()
    conv = db.table("conversations").select("google_drive_file_id, manager_id").eq("id", conversation_id).execute()
    if not conv.data or not conv.data[0].get("google_drive_file_id"):
        raise HTTPException(status_code=400, detail="No recording file to retry")

    file_id = conv.data[0]["google_drive_file_id"]
    manager_id = conv.data[0]["manager_id"]
    db.table("conversations").update({"status": "analyzing"}).eq("id", conversation_id).execute()
    background_tasks.add_task(retry_recording, conversation_id, file_id, manager_id)
    return {"ok": True, "status": "retrying"}


@router.post("/manual")
async def manual_meeting(
    payload: ManualMeetingBody,
    background_tasks: BackgroundTasks,
    x_webhook_secret: Optional[str] = Header(None),
):
    """Lets an admin paste a Google Drive share link for a recording the automated
    poller never picked up (e.g. shared outside a watched folder) — processes it
    through the exact same download/transcribe/analyze pipeline as the poller,
    just triggered on demand instead of by folder scanning."""
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    file_id = extract_drive_file_id(payload.url)
    if not file_id:
        raise HTTPException(status_code=400, detail="Не вдалося розпізнати Google Drive file ID з посилання")

    db = get_supabase()

    # The automated poller may have already picked up this exact recording (same
    # file, different route in) — without this check, pasting its link here would
    # silently create a second conversation for the same call/meeting instead of
    # telling the admin it's already in the system.
    existing = db.table("conversations").select("id").eq("google_drive_file_id", file_id).execute()
    if existing.data:
        raise HTTPException(
            status_code=409,
            detail={"error": "Ця зустріч уже є в системі", "conversationId": existing.data[0]["id"]},
        )

    conv_data = {
        "type": "meeting",
        "date": payload.date or datetime.now(timezone.utc).isoformat(),
        "client_name": payload.client_name,
        "google_drive_file_id": file_id,
        "manager_id": payload.manager_id,
        "status": "analyzing",
    }
    conv_res = db.table("conversations").insert(conv_data).execute()
    conversation_id = conv_res.data[0]["id"]

    background_tasks.add_task(retry_recording, conversation_id, file_id, payload.manager_id)
    return {"ok": True, "conversationId": conversation_id}


def parse_recording_info(name: str) -> tuple[str, str | None]:
    """Extract (client label, meeting topic) from a Meet recording filename.
    Managers use either '|' or '/' as a separator, inconsistently:
      'sb-sb.com | Inweb | Знайомство з менеджером PPC - 2026/06/19 ... – Recording' -> ('sb-sb.com', 'Знайомство з менеджером PPC')
      'Inweb & StockMe / Знайомство з менеджером - 2026/07/01 ... – Recording' -> ('StockMe', 'Знайомство з менеджером')
    Splits only on a separator surrounded by spaces (" | " / " / ") so the "/" inside
    dates like "2026/07/01" is never mistaken for the delimiter. Some managers prefix the
    client with our own agency name ("Inweb & <client>") — stripped so the client label
    never reads as if Inweb itself were the client.
    Falls back to (raw name, None) if no recognizable separator is found."""
    parts = [p.strip() for p in re.split(r"\s+[|/]\s+", name)]
    if len(parts) >= 2:
        # "x"/"х" (Latin/Cyrillic) is a common "collab-style" connector some managers
        # use instead of "&" ("Inweb x Smobile.ua") — missing it here meant the whole
        # "Inweb x Smobile.ua" string got passed to normalize_domain as-is, which isn't
        # domain-shaped (has a space), so the meeting silently created its OWN
        # name-only contragent instead of matching the client's real one by domain.
        client = re.sub(r"^inweb\s*[&+xх]\s*", "", parts[0], flags=re.IGNORECASE).strip() or parts[0]
        # Topic is the last segment, with the trailing date/"Recording" stripped
        # (e.g. "- 2026/07/01 15:00 EEST – Recording").
        topic = re.split(r"\s*[-–]\s*\d{4}/", parts[-1])[0].strip()
        return client, (topic or None)
    # No "|"/"/" separator at all (e.g. "Inweb & Ukrfavorit - 2026/07/09 10:54 EEST – Recording") —
    # still strip the trailing date/"Recording" suffix and the "Inweb & " agency prefix,
    # the same way the len(parts) >= 2 branch above does.
    fallback = re.split(r"\s*[-–]\s*\d{4}/", name)[0].strip()
    fallback = re.sub(r"^inweb\s*[&+xх]\s*", "", fallback, flags=re.IGNORECASE).strip() or fallback
    fallback = re.sub(r"\s*\(.*?\)\s*$", "", fallback).strip() or name
    # Some managers write "Бриф <domain>" / "КП <domain>" — a meeting-type word
    # directly in front of the domain, no "|"/"/" separator (caught live:
    # "Бриф primelaser.com" became the client_name verbatim). If stripping the
    # first word leaves something domain-shaped (has a dot, no more spaces),
    # that's the real client label.
    lead_word_match = re.match(r"^\S+\s+(\S+\.\S+)$", fallback)
    if lead_word_match:
        fallback = lead_word_match.group(1)
    return fallback, None


@router.post("/poll")
async def poll_meetings(
    background_tasks: BackgroundTasks,
    x_webhook_secret: Optional[str] = Header(None),
):
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    db = get_supabase()
    queued = 0

    # Managers who self-authorized via the per-manager OAuth flow (google_drive_oauth.py)
    # — their own Drive is read directly, no manual folder-sharing needed at all, and it
    # survives Google rotating the "Google Meet" root folder (see
    # project_meet_folder_access_fragility memory).
    token_rows = db.table("manager_drive_tokens").select("manager_id, refresh_token, connected_at").execute()
    drive_tokens = {r["manager_id"]: r for r in (token_rows.data or [])}

    sources = db.table("meeting_sources").select("folder_id, manager_id, since_date, managers(email)").eq("enabled", True).execute()
    covered_manager_ids = set()

    for source in sources.data or []:
        folder_id = source["folder_id"]
        manager_id = source["manager_id"]
        covered_manager_ids.add(manager_id)
        owner_email = (source.get("managers") or {}).get("email")
        token = drive_tokens.get(manager_id)
        try:
            if token:
                # OAuth-connected — ignore the legacy shared-account folder_id/owner_email
                # path entirely, read the manager's own Drive directly instead.
                files = list_recordings("", since=source["since_date"], limit=20, refresh_token=token["refresh_token"])
            else:
                files = list_recordings(folder_id, since=source["since_date"], limit=20, owner_email=owner_email)
        except Exception as e:
            print(f"[meetings] failed to list folder {folder_id} (manager {manager_id}): {e}")
            continue

        for f in files:
            existing = db.table("conversations").select("id").eq("google_drive_file_id", f["id"]).execute()
            if existing.data:
                continue
            background_tasks.add_task(process_recording, f, manager_id)
            queued += 1

    # A manager can connect their Drive via OAuth without ever having a meeting_sources
    # row configured (that used to require manually pasting a folder ID) — poll those
    # too, bounded to meetings created after they connected so this never bulk-scans
    # their whole Drive history on the first run.
    for manager_id, token in drive_tokens.items():
        if manager_id in covered_manager_ids:
            continue
        try:
            files = list_recordings("", since=token["connected_at"], limit=20, refresh_token=token["refresh_token"])
        except Exception as e:
            print(f"[meetings] failed to list OAuth-connected Drive for manager {manager_id}: {e}")
            continue

        for f in files:
            existing = db.table("conversations").select("id").eq("google_drive_file_id", f["id"]).execute()
            if existing.data:
                continue
            background_tasks.add_task(process_recording, f, manager_id)
            queued += 1

    return {"status": "queued", "count": queued}


async def process_recording(file: dict, manager_id: str) -> None:
    db = get_supabase()
    file_id = file["id"]
    print(f"[meetings] processing {file['name']} ({file_id})")

    # Insert a placeholder row first so concurrent polls never double-process this file.
    try:
        client_name, topic = parse_recording_info(file["name"])
        conv_data = {
            "type": "meeting",
            "date": file.get("createdTime"),
            "client_name": client_name,
            "client_company": topic,
            "google_drive_file_id": file_id,
            "manager_id": manager_id,
            "status": "analyzing",
        }
        conv_res = db.table("conversations").insert(conv_data).execute()
        conversation_id = conv_res.data[0]["id"]
        # No inline player for meetings — the frontend links out to Google Drive directly
        # (built from google_drive_file_id) instead of proxying the recording ourselves.
    except Exception as e:
        print(f"[meetings] ERROR inserting placeholder for {file_id}: {e}")
        return

    await _download_transcribe_analyze(db, conversation_id, file_id, manager_id)


# Shared by fresh processing (process_recording, above) and stuck-conversation
# recovery (retry_recording, below) — download/transcribe/analyze/save against an
# EXISTING conversation row, so retrying never inserts a duplicate placeholder.
async def _download_transcribe_analyze(db, conversation_id: str, file_id: str, manager_id: str) -> None:
    local_path = None
    try:
        # A manager-owned recording that was never manually shared with the polling
        # account is only downloadable as that manager — use their own OAuth token
        # (google_drive_oauth.py) when they've connected one.
        token_row = db.table("manager_drive_tokens").select("refresh_token").eq("manager_id", manager_id).execute()
        refresh_token = token_row.data[0]["refresh_token"] if token_row.data else None

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            local_path = tmp.name
        download_recording(file_id, local_path, refresh_token=refresh_token)

        result = await transcribe_meeting(local_path)
        transcript = result["transcript"]

        conv_update = {
            "transcript": transcript,
            "duration_seconds": result["duration_seconds"],
        }
        if result.get("speaker_talk_seconds"):
            conv_update["speaker_talk_seconds"] = result["speaker_talk_seconds"]
        db.table("conversations").update(conv_update).eq("id", conversation_id).execute()

        if not transcript:
            db.table("conversations").update({"status": "failed"}).eq("id", conversation_id).execute()
            return

        # A recording can "successfully" transcribe (no exception, non-empty string)
        # while still carrying no real conversation — e.g. silence, hold music, or a
        # stuck filler sound that _clean_utterance_text collapses down to almost
        # nothing. Sending that to Claude produces an arbitrary low score that reads
        # as a bad performance review, when the real cause is a technical recording
        # failure. Treat it as a distinct, non-scored outcome instead.
        if result.get("word_count", 0) < 20 or result.get("speaker_count", 0) == 0:
            db.table("conversations").update({"status": "no_transcript"}).eq("id", conversation_id).execute()
            return

        analysis, analysis_cost_usd, analysis_input_tokens, analysis_output_tokens = await analyze_transcript(transcript, manager_id=manager_id, conversation_type="meeting")

        db.table("ai_analysis").insert({
            "conversation_id": conversation_id,
            "score": analysis.get("score"),
            "summary": analysis.get("summary"),
            "strengths": analysis.get("strengths", []),
            "weaknesses": analysis.get("weaknesses", []),
            "recommendations": analysis.get("recommendations", []),
            "criteria": analysis.get("criteria"),
            "manager_mood": analysis.get("manager_mood"),
            "client_mood": analysis.get("client_mood"),
        }).execute()

        # criteria_explanations / speaker_labels are newer columns — don't let a pending migration break the analysis.
        try:
            extra = {}
            if analysis.get("criteria_explanations") is not None:
                extra["criteria_explanations"] = analysis["criteria_explanations"]
            if analysis.get("speaker_labels"):
                extra["speaker_labels"] = analysis["speaker_labels"]
            if analysis.get("insights") is not None:
                extra["insights"] = analysis["insights"]
            if analysis.get("tagged_moments") is not None:
                extra["tagged_moments"] = analysis["tagged_moments"]
            extra["cost_usd"] = analysis_cost_usd
            if extra:
                db.table("ai_analysis").update(extra).eq("conversation_id", conversation_id).execute()
        except Exception as ce:
            print(f"[meetings] criteria_explanations/speaker_labels not saved (migration applied?): {ce}")

        # Talk/listen ratio — combines speaker_talk_seconds saved above (from
        # AssemblyAI utterance timestamps) with the speaker_labels role mapping
        # Claude just returned. Purely derived after the fact; never part of the
        # prompt/score.
        try:
            if analysis.get("speaker_labels") and result.get("speaker_talk_seconds"):
                manager_talk_pct = compute_manager_talk_pct(result["speaker_talk_seconds"], analysis["speaker_labels"])
                if manager_talk_pct is not None:
                    db.table("conversations").update({"manager_talk_pct": manager_talk_pct}).eq("id", conversation_id).execute()
        except Exception as te:
            print(f"[meetings] talk ratio not computed (migration applied?): {te}")

        # Append-only cost log — unlike ai_analysis.cost_usd (overwritten on every
        # re-analysis), this survives every run so total spend is never lost.
        try:
            db.table("ai_cost_log").insert({
                "conversation_id": conversation_id,
                "cost_usd": analysis_cost_usd,
                "input_tokens": analysis_input_tokens,
                "output_tokens": analysis_output_tokens,
            }).execute()
        except Exception as ce:
            print(f"[meetings] cost log not saved (migration applied?): {ce}")

        update_data = {"status": "analyzed"}
        if analysis.get("service"):
            update_data["service"] = analysis["service"]
        try:
            if analysis.get("conversation_kind"):
                db.table("conversations").update({"conversation_kind": analysis["conversation_kind"]}).eq("id", conversation_id).execute()
        except Exception as ke:
            print(f"[meetings] conversation_kind not saved (migration applied?): {ke}")
        db.table("conversations").update(update_data).eq("id", conversation_id).execute()

        score = analysis.get("score")
        mgr = db.table("managers").select("name").eq("id", manager_id).execute()
        manager_name = mgr.data[0]["name"] if mgr.data else ""

        notif_type = "low_score" if (score is not None and score < 60) else "analyzed"
        db.table("notifications").insert({
            "type": notif_type,
            "title": "Низький бал зустрічі" if notif_type == "low_score" else "Зустріч проаналізовано",
            "body": f"{manager_name} — бал {score}/100" if score is not None else f"{manager_name} — аналіз завершено",
            "href": f"/conversations/{conversation_id}",
            "read": False,
        }).execute()

        print(f"[meetings] Done: {file_id} → score={score}")
    except Exception as e:
        # str(e) alone can be empty for some exceptions (e.g. network/timeout errors
        # raised with no args) — log the type name and full traceback too, otherwise
        # a real failure shows up as an unhelpful "ERROR processing X: " with nothing
        # after the colon.
        import traceback
        print(f"[meetings] ERROR processing {file_id}: {type(e).__name__}: {e}")
        traceback.print_exc()
        db.table("conversations").update({"status": "failed"}).eq("id", conversation_id).execute()
    finally:
        if local_path and os.path.exists(local_path):
            os.remove(local_path)


async def retry_recording(conversation_id: str, file_id: str, manager_id: str) -> None:
    """Re-runs a stuck meeting from scratch (re-download + re-transcribe + re-analyze)
    against its EXISTING conversation row — used by the stuck-conversation recovery
    endpoint in recovery.py, for meetings that never got a transcript saved because
    the container was killed mid-download/mid-transcription (e.g. during a deploy)."""
    db = get_supabase()
    print(f"[meetings] retrying stuck recording {file_id} (conversation {conversation_id})")

    await _download_transcribe_analyze(db, conversation_id, file_id, manager_id)
