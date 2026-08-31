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
    <br> becomes a real newline, preserving paragraph breaks within one comment for readability."""
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


MSG_SEP = "\x1e"  # separates distinct Planfix comments; real "\n" is reserved for in-message paragraph breaks


def build_transcript(comments: list[dict]) -> str:
    """Formats each comment as '[timestamp] [ROLE] Real Name: text'. The [MANAGER]/[CLIENT]
    tag is what the frontend's transcript renderer uses to color/side each line (definitive,
    not a guess) — the real Planfix name (e.g. "Дима", "Artem Khiminets") is kept as the
    speaker label instead of a generic "Менеджер"/"Клієнт", since a chat can have more than
    one person on either side and the name is exactly what tells them apart."""
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
    newest message — what actually gets sent to Claude for analysis."""
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
