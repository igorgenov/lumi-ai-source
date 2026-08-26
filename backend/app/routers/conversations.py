from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.db.session import get_db

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("/")
async def list_conversations(
    manager_id: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    service: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    score_min: Optional[int] = Query(None),
    score_max: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, le=100),
    db=Depends(get_db),
):
    """List conversations with optional filters. Stub — returns empty list."""
    return {"items": [], "total": 0, "page": page, "per_page": per_page}


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, db=Depends(get_db)):
    """Get a single conversation with full AI analysis."""
    return {"id": conversation_id}
