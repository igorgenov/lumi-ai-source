"""
Automated integrity check for score/criteria values that
violate the app's own conditional-scoring rules. Runs the
same fix a human would apply by hand via the Supabase REST API, and logs what it
did to activity_log so it stays auditable rather than a silent background mutation.

Triggered daily by Cloud Scheduler hitting POST /api/audit/fix-score-integrity.
Reuses the same shared secret as the meetings poller (same trust boundary: an
internal cron caller, not a public endpoint).
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Header

from app.services.supabase_client import get_supabase
from app.core.config import settings

router = APIRouter(prefix="/audit", tags=["audit"])

# For PM: all meeting types can have scores (unlike sales which only scored Брифування/КП).
# We just ensure that null scores stay null for conversations without enough context.


@router.post("/fix-score-integrity")
async def fix_score_integrity(x_webhook_secret: Optional[str] = Header(None)):
    if settings.MEETINGS_POLL_SECRET:
        if x_webhook_secret != settings.MEETINGS_POLL_SECRET:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    db = get_supabase()

    # Find conversations where AI analysis exists but score/criteria are inconsistent
    convs = db.table("conversations").select("id, conversation_kind").execute().data or []
    kind_by_id = {c["id"]: c.get("conversation_kind") for c in convs}

    # For PM: ensure that conversations without a valid AI analysis don't have stale scores
    conv_ids = [c["id"] for c in convs]
    if not conv_ids:
        return {"status": "ok", "fixed": 0}

    rows = db.table("ai_analysis").select("id, conversation_id, score, criteria").in_("conversation_id", conv_ids).execute().data or []
    
    fixed = 0
    for r in rows:
        conv_id = r.get("conversation_id")
        if not conv_id:
            continue
        
        # If conversation_kind is null or too short, score should be null
        kind = kind_by_id.get(conv_id)
        if not kind:
            has_score = r.get("score") is not None
            has_criteria = r.get("criteria") not in (None, {})
            if has_score or has_criteria:
                db.table("ai_analysis").update({
                    "score": None, 
                    "criteria": None, 
                    "criteria_explanations": None
                }).eq("id", r["id"]).execute()
                fixed += 1

    if fixed:
        try:
            db.table("activity_log").insert({
                "kind": "score_integrity_autofix",
                "summary": f"Автоматична перевірка цілісності: очищено бал/критерії у {fixed} розмов(и) з невідповідним контекстом.",
                "href": "/conversations",
                "performed_by": None,
            }).execute()
        except Exception as e:
            print(f"[audit] failed to log activity (best-effort): {e}")

    print(f"[audit] fix-score-integrity: {fixed} score/criteria fixed")
    return {"status": "ok", "fixed": fixed}
