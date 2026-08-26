from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.db.session import get_db

router = APIRouter(prefix="/managers", tags=["managers"])


@router.get("/")
async def list_managers(
    sort_by: str = Query("avg_score", regex="^(avg_score|total_conversations|success_rate)$"),
    period: str = Query("month", regex="^(week|month|quarter)$"),
    db=Depends(get_db),
):
    """List managers with aggregated stats."""
    return {"items": []}


@router.get("/{manager_id}/stats")
async def get_manager_stats(
    manager_id: str,
    period: str = Query("month"),
    db=Depends(get_db),
):
    """Get detailed stats for a single manager."""
    return {"manager_id": manager_id, "period": period}
