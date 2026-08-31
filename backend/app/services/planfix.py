"""
Planfix REST API client for the Telegram-chat analysis pipeline.
Chat correspondence is synced into Planfix as task comments by a bot in each client's
Telegram chat — one task per client, template "Sales / лог чату з контрагентом / Telegram"
(template.id = 2540515, confirmed live against task 3257595). Comment author distinguishes
manager ("user:<id>") from client ("contact:<id>") — Planfix already separates speaker
per comment, no text parsing needed.
"""
from __future__ import annotations
import re
from datetime import datetime, timedelta

import httpx

from app.core.config import settings

CLIENT_NAME_RE = re.compile(r"^-?\s*(.+?)\s*/\s*(\S*)\s*/\s*Лог", re.IGNORECASE)


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.PLANFIX_API_TOKEN}", "Content-Type": "application/json"}


async def list_chat_tasks(page_size: int = 100) -> list[dict]:
    """All tasks under the Telegram chat-log template, across every page."""
    tasks: list[dict] = []
    offset = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.post(
                f"{settings.PLANFIX_BASE_URL}/task/list",
                headers=_headers(),
                json={
                    "offset": offset,
                    "pageSize": page_size,
                    "filters": [{"type": 51, "operator": "equal", "value": settings.PLANFIX_CHAT_TEMPLATE_ID}],
                    "fields": "id,name",
                },
            )
            resp.raise_for_status()
            batch = resp.json().get("tasks", [])
            tasks.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
    return tasks


async def get_task_name(task_id: int) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.PLANFIX_BASE_URL}/task/{task_id}",
            headers=_headers(),
            params={"fields": "id,name"},
        )
        resp.raise_for_status()
        return resp.json()["task"]["name"]


SERVICE_NAMES = ["SEO", "GEO", "PPC", "Analytics", "ASO", "ASA", "Nonprofit"]


# Deal-task custom fields, discovered by brute-forcing numeric field IDs against a real
# lost deal (task 3227791, confirmed live 2026-08-12) — Planfix has no endpoint that
# enumerates a task's custom fields by name, only the same "bare numeric ID in fields"
# trick used for CONTRAGENT_DEALS_FIELD_ID above.
DEAL_KP_FIELD_ID = 387                    # "КП" — link to the presented commercial proposal (Slides/Docs)
DEAL_LOST_DATE_FIELD_ID = 475             # "Дата перевода сделки в статус 'Закрыта и нереализована'"
DEAL_SM_REASON_FIELD_ID = 1667            # "Причина відмови – 2025" — dropdown, SM-picked category
DEAL_SM_REASON_COMMENT_FIELD_ID = 1669    # "Коментар до причини відмови" — SM's free-text comment
DEAL_CLIENT_SERVICE_FIELD_ID = 443        # "Послуга для клієнта" — granular sub-service (e.g. "SEO — переїзд
                                           # сайту" vs "SEO на етапі розробки"), finer-grained than the coarse
                                           # SEO/PPC/etc. guessed from the task name — two deals can share the
                                           # coarse service yet be genuinely different projects; this field is
                                           # what tells a human (not the AI attribution logic, which still can't
                                           # safely split conversations this finely) apart at a glance.
DEAL_SM_WIN_REASON_FIELD_ID = 2431        # "Чому клієнт обрав Inweb?" — SM's own free-text answer for WON deals,
                                           # win-side mirror of DEAL_SM_REASON_FIELD_ID/COMMENT above (discovered
                                           # live against task 3269083, 2026-08-13). Shown side-by-side with the
                                           # independent AI conclusion, same non-anchoring design as loss-reason.
DEAL_SM_COMPETITORS_FIELD_ID = 2441       # "Кого розглядають серед конкурентів" — free-text, same task/group.


async def get_task(task_id: int) -> dict:
    """Deal task's name + status + granular client-facing service label. status.name is
    a human-written label ("Успішно реалізовано", "Закрито і не реалізовано") that's
    directly usable as a won/lost signal without needing per-account status ID mapping."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.PLANFIX_BASE_URL}/task/{task_id}",
            headers=_headers(),
            params={"fields": f"id,name,status,{DEAL_CLIENT_SERVICE_FIELD_ID},{DEAL_SM_WIN_REASON_FIELD_ID},{DEAL_SM_COMPETITORS_FIELD_ID}"},
        )
        resp.raise_for_status()
        return resp.json()["task"]


def get_deal_client_service(task: dict) -> str | None:
    """Reads the "Послуга для клієнта" value already present on a task dict fetched via
    get_task() above — no extra API call, since get_task now requests this field by
    default."""
    for c in task.get("customFieldData") or []:
        fid = (c.get("field") or {}).get("id")
        val = c.get("value")
        if fid == DEAL_CLIENT_SERVICE_FIELD_ID and val:
            return str(val)
    return None


def get_deal_sm_win_reason(task: dict) -> tuple[str | None, str | None]:
    """Reads "Чому клієнт обрав Inweb?" + "Кого розглядають серед конкурентів" already
    present on a task dict fetched via get_task() above — no extra API call."""
    reason, competitors = None, None
    for c in task.get("customFieldData") or []:
        fid = (c.get("field") or {}).get("id")
        val = c.get("value")
        if fid == DEAL_SM_WIN_REASON_FIELD_ID and val:
            reason = str(val)
        elif fid == DEAL_SM_COMPETITORS_FIELD_ID and val:
            competitors = str(val)
    return reason, competitors


async def get_deal_kp_and_lost_date(task_id: int) -> tuple[str | None, str | None]:
    """Non-empty kp_link is the proxy for "deal reached КП stage" — Planfix's REST API
    doesn't expose funnel-stage history directly, but a presented KP always has this
    field filled by the manager. lost_date narrows loss-reason analysis to deals closed
    recently enough that source conversations are still complete."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.PLANFIX_BASE_URL}/task/{task_id}",
            headers=_headers(),
            params={"fields": f"id,{DEAL_KP_FIELD_ID},{DEAL_LOST_DATE_FIELD_ID}"},
        )
        resp.raise_for_status()
        data = resp.json()["task"]
    custom = data.get("customFieldData") or []
    kp_link, lost_date = None, None
    for c in custom:
        fid = (c.get("field") or {}).get("id")
        val = c.get("value")
        if fid == DEAL_KP_FIELD_ID and val:
            kp_link = str(val)
        elif fid == DEAL_LOST_DATE_FIELD_ID and val:
            lost_date = (val or {}).get("datetime") if isinstance(val, dict) else str(val)
    return kp_link, lost_date


DEAL_COMPLETION_DATE_FIELD_ID = 1449  # "Дата завершення угоди" — generic close date, set for WON deals too
                                        # (unlike DEAL_LOST_DATE_FIELD_ID, which is lost-specific)


async def get_deal_kp_and_completion_date(task_id: int) -> tuple[str | None, str | None]:
    """Win-reason counterpart to get_deal_kp_and_lost_date — same kp_link proxy, but
    reads the generic completion-date field since a WON deal never has the lost-specific
    date field filled."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.PLANFIX_BASE_URL}/task/{task_id}",
            headers=_headers(),
            params={"fields": f"id,{DEAL_KP_FIELD_ID},{DEAL_COMPLETION_DATE_FIELD_ID}"},
        )
        resp.raise_for_status()
        data = resp.json()["task"]
    custom = data.get("customFieldData") or []
    kp_link, completion_date = None, None
    for c in custom:
        fid = (c.get("field") or {}).get("id")
        val = c.get("value")
        if fid == DEAL_KP_FIELD_ID and val:
            kp_link = str(val)
        elif fid == DEAL_COMPLETION_DATE_FIELD_ID and val:
            completion_date = (val or {}).get("datetime") if isinstance(val, dict) else str(val)
    return kp_link, completion_date


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


async def get_deal_sm_reason(task_id: int) -> tuple[str | None, str | None]:
    """SM's own manually-picked reason category + free-text comment — fetched purely for
    DISPLAY next to Lumi's independent AI conclusion (see loss_reason.py), never fed into
    the AI prompt itself, so the AI's read of the raw conversations stays uncontaminated
    by what the manager already believed happened."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.PLANFIX_BASE_URL}/task/{task_id}",
            headers=_headers(),
            params={"fields": f"id,{DEAL_SM_REASON_FIELD_ID},{DEAL_SM_REASON_COMMENT_FIELD_ID}"},
        )
        resp.raise_for_status()
        data = resp.json()["task"]
    custom = data.get("customFieldData") or []
    category, comment = None, None
    for c in custom:
        fid = (c.get("field") or {}).get("id")
        val = c.get("value")
        if fid == DEAL_SM_REASON_FIELD_ID and val:
            category = (val or {}).get("value") if isinstance(val, dict) else str(val)
        elif fid == DEAL_SM_REASON_COMMENT_FIELD_ID and val:
            comment = _strip_html(str(val))
    return category, comment


# The "Список угод контрагента" custom field on a Contact — a multi-line text field
# listing HTML links to every deal task for that contact. Earlier attempts to read
# custom fields via `fields=customFieldData` or `fields=customFieldData:721` both
# silently returned nothing; a BARE numeric field ID in `fields` (confirmed live
# 2026-07-27 against contacts 31684 and 31424) is what actually works. This is the
# mechanism that lets a contragent's deals be discovered automatically instead of
# pasted in by hand — but per Aibis, this field isn't always populated on every
# contact, so manual add-by-ID (see routers/contragents.py) stays as the fallback.
CONTRAGENT_DEALS_FIELD_ID = 721


async def get_contact_deal_task_ids_and_group(contact_id: int) -> tuple[list[int], str | None]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.PLANFIX_BASE_URL}/contact/{contact_id}",
            headers=_headers(),
            params={"fields": f"id,name,group,{CONTRAGENT_DEALS_FIELD_ID}"},
        )
        resp.raise_for_status()
        data = resp.json()["contact"]
    custom = data.get("customFieldData") or []
    field = next((c for c in custom if (c.get("field") or {}).get("id") == CONTRAGENT_DEALS_FIELD_ID), None)
    deal_ids: list[int] = []
    if field:
        html = field.get("value") or ""
        deal_ids = sorted({int(m) for m in re.findall(r"/task/(\d+)", html)})
    group_name = (data.get("group") or {}).get("name")
    return deal_ids, group_name


def guess_service(task_name: str) -> str | None:
    """Deal tasks are named '{domain} / {client name} / {service}' — pull the service
    out of whichever segment matches a known one, rather than assuming position (some
    have a trailing '(2)' or extra suffix after the service)."""
    for part in task_name.split("/"):
        part = part.strip()
        for svc in SERVICE_NAMES:
            if part.lower().startswith(svc.lower()):
                return svc
    return None


def parse_client_info(task_name: str) -> tuple[str, str | None]:
    """'- Артем / 15879997929 / Лог чата з телеграм' -> ('Артем', '15879997929').
    The middle field (phone/domain) is sometimes blank in Planfix itself (client added
    by name only) — '- Анатолій /  / Лог...' still matches, phone comes back as None
    rather than an empty string."""
    m = CLIENT_NAME_RE.match(task_name)
    if m:
        phone = m.group(2).strip()
        return m.group(1).strip(), phone or None
    return task_name.strip(), None


def _comment_datetime(comment: dict) -> datetime | None:
    dt = (comment.get("dateTime") or {}).get("datetime")
    if not dt:
        return None
    try:
        return datetime.fromisoformat(dt.replace("Z", "+00:00"))
    except ValueError:
        return None


async def get_task_comments(task_id: int, since: datetime | None = None, page_size: int = 100) -> list[dict]:
    """All comments on a task, oldest first, optionally only those after `since` —
    the boundary that keeps this pipeline from ever bulk-analyzing years of history."""
    comments: list[dict] = []
    offset = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.post(
                f"{settings.PLANFIX_BASE_URL}/task/{task_id}/comments/list",
                headers=_headers(),
                json={"offset": offset, "pageSize": page_size, "fields": "id,description,dateTime,owner,files"},
            )
            resp.raise_for_status()
            batch = resp.json().get("comments", [])
            comments.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
    # Planfix returns comments newest-first natively — kept as-is so the chat transcript
    # displays newest-message-first, matching Planfix's own UI (calls/meetings use a
    # completely separate transcript builder and are unaffected by this ordering).
    # Strict "after", not "on or after": `since` is always set to the timestamp of the
    # last comment we already processed (planfix_last_comment_at) — with >=, that exact
    # already-seen comment matches its own cutoff forever, so a chat resolves as having
    # "new" content on every single poll no matter how long ago it actually went quiet,
    # paying for a full re-analysis each time for zero new text. Caught live 2026-08-16:
    # a one-message chat (task 3349021) got billed on 4 separate polls across 3 days with
    # its transcript byte-for-identical every time — ~$0.20 wasted on that one chat alone,
    # and the same bug applied to every chat's LAST comment on every poll cycle.
    if since:
        comments = [c for c in comments if (dt := _comment_datetime(c)) and dt > since]
    return comments


def owner_role(comment: dict) -> str | None:
    owner_id = (comment.get("owner") or {}).get("id", "")
    if owner_id.startswith("user:"):
        return "manager"
    if owner_id.startswith("contact:"):
        return "client"
    return None


def strip_html(text: str) -> str:
    """Comment bodies come as light HTML (<br> etc.) — strip tags for a clean transcript line.
    <br> becomes a real newline, preserving paragraph breaks within one comment for readability.
    This is safe only because build_transcript below joins separate comments with MSG_SEP (not
    "\\n") — the frontend splits on MSG_SEP, so an internal newline here stays inside one bubble
    instead of spawning new, speaker-less bubbles (that regression happened once already, when
    <br> was still mapped to a space and comments were joined with "\\n")."""
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


MSG_SEP = "\x1e"  # separates distinct Planfix comments; real "\n" is reserved for in-message paragraph breaks


def build_transcript(comments: list[dict]) -> str:
    """Formats each comment as '[timestamp] [ROLE] Real Name: text'. The [MANAGER]/[CLIENT]
    tag is what the frontend's transcript renderer uses to color/side each line (definitive,
    not a guess) — the real Planfix name (e.g. "Дима", "Artem Khiminets") is kept as the
    speaker label instead of a generic "Менеджер"/"Клієнт", since a chat can have more than
    one person on either side and the name is exactly what tells them apart.

    A comment can be a bare file attachment with no description (e.g. a КП PDF) — its
    filename is real signal (often names the service and even the client's domain, e.g.
    "Inweb_Комерційна_пропозиція_з_SEO_аудиту_для_lizardmoving_com.pdf"), so it's kept as
    a "[Надіслано файл: ...]" line instead of being silently dropped for having no text."""
    lines = []
    for c in comments:
        role = owner_role(c)
        if role is None:
            continue
        text = strip_html(c.get("description") or "")
        if not text:
            files = c.get("files") or []
            if not files:
                continue
            text = "[Надіслано файл: " + ", ".join(f.get("name", "") for f in files if f.get("name")) + "]"
        name = (c.get("owner") or {}).get("name") or ("Менеджер" if role == "manager" else "Клієнт")
        tag = "MANAGER" if role == "manager" else "CLIENT"
        dt = (c.get("dateTime") or {}).get("datetime", "")
        lines.append(f"[{dt}] [{tag}] {name}: {text}")
    return MSG_SEP.join(lines)


ANALYSIS_WINDOW_DAYS = 30


def window_transcript(transcript: str, days: int = ANALYSIS_WINDOW_DAYS) -> str:
    """Returns only the comments from the last `days`, relative to the transcript's own
    newest message — what actually gets sent to Claude for analysis. The full transcript
    is stored/shown as-is in the UI (see chats.py, which now appends new comments instead
    of overwriting); this bounds what Claude sees to a recent conversational arc instead
    of either a single isolated new message (loses context — caught live 2026-08-16,
    Гержик Андрій chat: AI could only see "one message, no visible client replies" despite
    a real ongoing negotiation) or the full ever-growing history (unbounded cost as a
    chat ages — the exact thing the per-task incremental cutoff was built to avoid).
    30 days, not 7: some of the AI's own insight fields (stall_reason,
    manager_recovery_attempt — "чи менеджер написав follow-up через 5 днів") need to see
    BOTH the stall AND the recovery to mean anything; a 7-day window risks showing only
    the recovery message with no visible stall to have recovered from."""
    lines = transcript.split(MSG_SEP)
    parsed: list[tuple[datetime | None, str]] = []
    for line in lines:
        m = re.match(r"^\[([^\]]+)\]", line)
        dt = None
        if m:
            try:
                dt = datetime.fromisoformat(m.group(1).replace("Z", "+00:00"))
            except ValueError:
                dt = None
        parsed.append((dt, line))
    dts = [dt for dt, _ in parsed if dt]
    if not dts:
        return transcript
    cutoff = max(dts) - timedelta(days=days)
    kept = [line for dt, line in parsed if dt is None or dt >= cutoff]
    return MSG_SEP.join(kept)
