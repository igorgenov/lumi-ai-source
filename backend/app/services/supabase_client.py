from __future__ import annotations
from supabase import create_client, Client
from app.core.config import settings
from typing import Optional

_client: Optional[Client] = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client
