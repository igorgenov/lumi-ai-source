"""
Telegram chat-analysis pipeline — pulls client correspondence synced into Planfix,
analyzes it with Claude, and saves it as a conversation (type="chat").

Sync stays OFF until chat_sync_settings.enabled is true (POST /poll is a no-op until
then). POST /test processes exactly one task, for validating the pipeline against a
single known real chat before enabling /poll.

Per-task incremental cutoff: each poll uses the chat's own planfix_last_comment_at
as the cutoff, so a later poll only ever pays for genuinely new messages. Only a chat
Lumi has never seen before falls back to the global since_date. Additionally, any chat
whose most recent comment is more than STALE_WORKING_DAYS working days old is skipped
entirely (not analyzed).
"""
from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Header
from pydantic import BaseModel

from app.services import planfix
from app.services.chat_analysis import analyze_chat
from app.services.supabase_client import get_supabase
from app.core.config import settings

router = APIRouter(prefix="/chats", tags=["chats"])

# Same "no public-holiday calendar, Mon-Fri only" approximation as inactivity.py's
# 10-working-day contragent auto-archive threshold — kept identical intentionally,
# since both represent the same "is this client conversation still live" judgment.
STALE_WORKING_DAYS = 10

# Never analyze correspondence older than this, no matter what `since` cutoff is passed
# in (global backfill setting, or a manual /test override) — a client who went quiet
# months ago and just came back shouldn't cost a full re-read of an old thread every
# time their chat is (re)synced. Set to Lumi AI's own launch month (June 2026) — history
# from before the tool existed isn't relevant to analyze. Confirmed 2026-07-31 after a
# manual add pulled 13 months of history (280K chars, $0.35) for a chat that had gone
# stale and resumed.
HISTORY_FLOOR = datetime(2026, 6, 1, tzinfo=timezone.utc)


def _working_days_between(start: datetime, end: datetime) -> int:
    if end <= start:
        return 0
    days = 0
    cur = start.date()
    end_date = end.date()
    while cur < end_date:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            days += 1
    return days


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _resolve_manager_id(db, comments: list[dict]) -> str | None:
    manager_owner_ids = [
        c["owner"]["id"].split(":", 1)[1] for c in comments if planfix.owner_role(c) == "manager"
    ]
    if not manager_owner_ids:
        return None
    most_common = Counter(manager_owner_ids).most_common(1)[0][0]
    row = db.table("planfix_manager_map").select("manager_id").eq("planfix_user_id", most_common).execute()
    return row.data[0]["manager_id"] if row.data else None


async def _process_chat_task(db, task_id: int, task_name: str, since: datetime, skip_stale_check: bool = False) -> dict:
    since = max(since, HISTORY_FLOOR)
    comments = await planfix.get_task_comments(task_id, since=since)
    if not comments:
        return {"task_id": task_id, "status": "no_new_messages"}

    transcript = planfix.build_transcript(comments)
    if not transcript.strip():
        return {"task_id": task_id, "status": "no_text"}

    manager_id = _resolve_manager_id(db, comments)
    client_name, client_phone = planfix.parse_client_info(task_name)
    last_comment_at = max(
        c["dateTime"]["datetime"] for c in comments if (c.get("dateTime") or {}).get("datetime")
    )

    # Skip dormant threads — a chat whose newest message is already >10 working days
    # old isn't "live correspondence" anymore (it's old history the `since` cutoff
    # happened to still include), so there's no point paying to analyze it during the
    # automated weekly poll. A deliberate manual /test call on one specific chat
    # (skip_stale_check=True) bypasses this — that's an intentional single re-run, not
    # the bulk sweep this guard exists to protect.
    last_comment_dt = _parse_dt(last_comment_at)
    if not skip_stale_check and _working_days_between(last_comment_dt, datetime.now(timezone.utc)) > STALE_WORKING_DAYS:
        return {"task_id": task_id, "status": "stale_skipped", "last_comment_at": last_comment_at}

    existing = db.table("conversations").select("id, transcript").eq("planfix_task_id", task_id).execute()

    # Append, don't overwrite — the stored transcript is the FULL relationship history
    # (shown as-is on the conversation page). Only what gets sent to Claude for scoring
    # is bounded (window_transcript, below) — previously this field held only the newest
    # incremental batch, so a re-analysis saw a single isolated message with no memory of
    # the negotiation it belonged to (caught live 2026-08-16, Гержик Андрій chat).
    prior_transcript = (existing.data[0].get("transcript") or "") if existing.data else ""
    full_transcript = f"{prior_transcript}{planfix.MSG_SEP}{transcript}" if prior_transcript else transcript
    analysis_transcript = planfix.window_transcript(full_transcript)

    if existing.data:
        conversation_id = existing.data[0]["id"]
        db.table("conversations").update({
            "transcript": full_transcript,
            "manager_id": manager_id,
            "conversation_kind": "Telegram чат",
            "planfix_last_comment_at": last_comment_at,
            "status": "analyzing",
        }).eq("id", conversation_id).execute()
    else:
        conv_res = db.table("conversations").insert({
            "type": "chat",
            "manager_id": manager_id,
            "client_name": client_name,
            "date": last_comment_at,
            "transcript": full_transcript,
            "conversation_kind": "Telegram чат",
            "planfix_task_id": task_id,
            "planfix_last_comment_at": last_comment_at,
            "status": "analyzing",
        }).execute()
        conversation_id = conv_res.data[0]["id"]

    try:
        analysis, cost_usd, input_tokens, output_tokens = await analyze_chat(analysis_transcript, manager_id=manager_id)
    except Exception as e:
        db.table("conversations").update({"status": "failed"}).eq("id", conversation_id).execute()
        return {"task_id": task_id, "conversation_id": conversation_id, "status": "failed", "error": str(e)}

    # Snapshot the outgoing analysis before it's overwritten — a chat gets re-analyzed
    # every week as new messages come in, and without this the previous week's
    # score/summary is just gone, making it impossible to see how the conversation's
    # trajectory changed or to explain a coaching call made off an earlier snapshot.
    if existing.data:
        try:
            prev = db.table("ai_analysis").select("score, summary, client_mood, manager_mood, insights, strengths, weaknesses, criteria, created_at") \
                .eq("conversation_id", conversation_id).limit(1).execute().data
            if prev:
                p = prev[0]
                db.table("ai_analysis_history").insert({
                    "conversation_id": conversation_id,
                    "score": p.get("score"),
                    "summary": p.get("summary"),
                    "client_mood": p.get("client_mood"),
                    "manager_mood": p.get("manager_mood"),
                    "insights": p.get("insights"),
                    "strengths": p.get("strengths"),
                    "weaknesses": p.get("weaknesses"),
                    "criteria": p.get("criteria"),
                    "analyzed_at": p.get("created_at"),
                }).execute()
        except Exception as ce:
            print(f"[chats] analysis history snapshot failed (migration applied?): {ce}")

    db.table("ai_analysis").delete().eq("conversation_id", conversation_id).execute()
    db.table("ai_analysis").insert({
        "conversation_id": conversation_id,
        "score": analysis.get("score"),
        "summary": analysis.get("summary"),
        "strengths": analysis.get("strengths", []),
        "weaknesses": analysis.get("weaknesses", []),
        "recommendations": analysis.get("recommendations", []),
        "criteria": analysis.get("criteria"),
        "criteria_explanations": analysis.get("criteria_explanations"),
        "manager_mood": analysis.get("manager_mood"),
        "client_mood": analysis.get("client_mood"),
        "insights": analysis.get("insights"),
        "cost_usd": cost_usd,
    }).execute()

    # Append-only cost log — unlike ai_analysis.cost_usd (overwritten on every
    # re-analysis), this survives every run so total spend is never lost.
    try:
        db.table("ai_cost_log").insert({
            "conversation_id": conversation_id,
            "cost_usd": cost_usd,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }).execute()
    except Exception as ce:
        print(f"[chats] cost log not saved (migration applied?): {ce}")

    final_update: dict = {"status": "analyzed"}
    if analysis.get("service"):
        final_update["service"] = analysis["service"]
    if analysis.get("client_domain"):
        final_update["client_company"] = analysis["client_domain"]
    db.table("conversations").update(final_update).eq("id", conversation_id).execute()

    return {
        "task_id": task_id,
        "conversation_id": conversation_id,
        "status": "analyzed",
        "score": analysis.get("score"),
        "manager_id": manager_id,
        "client_name": client_name,
        "comment_count": len(comments),
    }


class TestChatBody(BaseModel):
    task_id: int
    since: Optional[str] = None  # ISO datetime override, validation-only — never used by /poll


@router.post("/test")
async def test_chat(payload: TestChatBody, x_webhook_secret: Optional[str] = Header(None)):
    """Manually process exactly one chat task by its Planfix task number — used to
    validate the pipeline against a single known real chat before enabling /poll.
    Accepts an optional `since` override so a known-old test chat can still be
    validated without touching the real chat_sync_settings.since_date used by /poll."""
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    db = get_supabase()
    if payload.since:
        since = _parse_dt(payload.since)
    else:
        cfg = db.table("chat_sync_settings").select("since_date").eq("id", 1).execute()
        since = _parse_dt(cfg.data[0]["since_date"]) if cfg.data else datetime.now(timezone.utc)

    task_name = await planfix.get_task_name(payload.task_id)
    return await _process_chat_task(db, payload.task_id, task_name, since, skip_stale_check=True)


class PollChatsBody(BaseModel):
    full: bool = False  # Kept for API compatibility, but no longer used for filtering


async def _process_chat_task_bg(task_id: int, task_name: str, since: datetime) -> None:
    """BackgroundTasks wrapper — swallows/logs errors since nothing awaits this."""
    try:
        db = get_supabase()
        result = await _process_chat_task(db, task_id, task_name, since)
        print(f"[chats] poll processed task {task_id}: {result.get('status')}")
    except Exception as e:
        print(f"[chats] poll failed for task {task_id}: {e}")


@router.post("/poll")
async def poll_chats(background_tasks: BackgroundTasks, payload: PollChatsBody = PollChatsBody(), x_webhook_secret: Optional[str] = Header(None)):
    """Triggered periodically by Cloud Scheduler once enabled — no-op while
    chat_sync_settings.enabled is false. See module docstring for the full/active-only
    two-tier cadence this powers.

    Queues each task as a FastAPI BackgroundTask (same pattern as /api/meetings/poll)
    and returns immediately — processing dozens of chats synchronously in one request
    was measured hitting Cloud Run's 300s request timeout (504) even for the smaller
    active-only scope, since each analyzed chat can take 10-20s (Claude call incl.
    thinking). The scheduler needs a fast response; the actual work continues after."""
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    db = get_supabase()
    cfg = db.table("chat_sync_settings").select("enabled,since_date").eq("id", 1).execute()
    if not cfg.data or not cfg.data[0]["enabled"]:
        return {"status": "disabled"}

    global_since = _parse_dt(cfg.data[0]["since_date"])
    # Per-task cutoff: a chat we've already processed uses its OWN last-seen comment
    # time (never re-pays for history already analyzed); only a chat Lumi has never
    # seen before falls back to the global backfill cutoff.
    known = db.table("conversations").select("planfix_task_id, planfix_last_comment_at").eq("type", "chat").execute().data or []
    last_seen: dict[int, datetime] = {
        r["planfix_task_id"]: _parse_dt(r["planfix_last_comment_at"])
        for r in known if r.get("planfix_task_id") and r.get("planfix_last_comment_at")
    }

    tasks = await planfix.list_chat_tasks()

    for t in tasks:
        since = last_seen.get(t["id"], global_since)
        background_tasks.add_task(_process_chat_task_bg, t["id"], t["name"], since)

    return {"status": "queued", "count": len(tasks)}
