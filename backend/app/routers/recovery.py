"""
Auto-recovery for conversations stuck in "analyzing" — this happens when a Cloud Run
deploy kills the background task mid-flight (meetings processing has no
protection against that). Previously the only signal was a passive "stuck" notification
that a human had to act on manually; this retries automatically instead.

Triggered periodically by Cloud Scheduler hitting POST /api/recovery/retry-stuck.
Reuses the same shared secret as the meetings poller (same trust boundary: an
internal cron caller, not a public endpoint).
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Header

from app.routers.meetings import retry_recording
from app.services.supabase_client import get_supabase
from app.core.config import settings

router = APIRouter(prefix="/recovery", tags=["recovery"])

STUCK_THRESHOLD_MINUTES = 60


@router.post("/retry-stuck")
async def retry_stuck(
    background_tasks: BackgroundTasks,
    x_webhook_secret: Optional[str] = Header(None),
):
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    db = get_supabase()
    threshold = (datetime.now(timezone.utc) - timedelta(minutes=STUCK_THRESHOLD_MINUTES)).isoformat()

    stuck = db.table("conversations") \
        .select("id, type, transcript, manager_id, google_drive_file_id, created_at") \
        .eq("status", "analyzing") \
        .lt("created_at", threshold) \
        .execute()

    queued = 0
    failed = 0
    for c in stuck.data or []:
        conversation_id = c["id"]
        if c["type"] == "meeting" and c.get("google_drive_file_id") and c.get("manager_id"):
            # Nothing was saved yet — re-download, re-transcribe, re-analyze from scratch.
            background_tasks.add_task(retry_recording, conversation_id, c["google_drive_file_id"], c["manager_id"])
            queued += 1
        else:
            # Nothing to recover from (no Drive file, or no manager) —
            # stop it from being retried forever and let a human investigate instead.
            db.table("conversations").update({"status": "failed"}).eq("id", conversation_id).execute()
            failed += 1

    print(f"[recovery] found {len(stuck.data or [])} stuck conversation(s): {queued} queued for retry, {failed} marked failed")
    return {"status": "ok", "found": len(stuck.data or []), "queued": queued, "failed": failed}
