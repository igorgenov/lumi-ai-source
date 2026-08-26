"""
Smoke tests for get_active_prompt() — the manager-to-prompt matching logic that was
silently broken for months (comparing manager NAME against manager_roles, which
actually stores manager UUIDs, so every call used whichever prompt happened to be
most-recently-updated instead of the one written for that manager).
"""
from unittest.mock import MagicMock, patch

from app.services.claude_analysis import get_active_prompt

MANAGER_A = "11111111-1111-1111-1111-111111111111"
MANAGER_B = "22222222-2222-2222-2222-222222222222"
UNKNOWN_MANAGER = "99999999-9999-9999-9999-999999999999"


def _mock_db(prompts: list[dict]):
    """Builds a fake Supabase client whose .table(...).select(...).eq(...).eq(...)
    .order(...).execute() chain returns `prompts` as .data, mirroring the real
    query shape in get_active_prompt()."""
    result = MagicMock()
    result.data = prompts
    query = MagicMock()
    query.execute.return_value = result
    # Every chained call (select/eq/eq/order) returns the same mock so the exact
    # call sequence in get_active_prompt() doesn't need to be replicated here.
    query.select.return_value = query
    query.eq.return_value = query
    query.order.return_value = query
    db = MagicMock()
    db.table.return_value = query
    return db


def test_matches_prompt_by_manager_uuid_not_recency():
    """The bug: an older prompt specifically assigned to MANAGER_A must win over a
    more-recently-updated prompt that isn't assigned to anyone in particular."""
    prompts = [
        {"text": "general fallback prompt", "manager_roles": [], "name": "General"},
        {"text": "LQS brief for manager A", "manager_roles": [MANAGER_A], "name": "LQS-brief"},
    ]
    with patch("app.services.claude_analysis.get_supabase", return_value=_mock_db(prompts)):
        assert get_active_prompt(manager_id=MANAGER_A) == "LQS brief for manager A"


def test_falls_back_to_first_active_prompt_when_manager_has_none():
    prompts = [
        {"text": "general fallback prompt", "manager_roles": [], "name": "General"},
        {"text": "LQS brief for manager A", "manager_roles": [MANAGER_A], "name": "LQS-brief"},
    ]
    with patch("app.services.claude_analysis.get_supabase", return_value=_mock_db(prompts)):
        assert get_active_prompt(manager_id=UNKNOWN_MANAGER) == "general fallback prompt"


def test_falls_back_to_first_active_prompt_when_no_manager_given():
    prompts = [
        {"text": "general fallback prompt", "manager_roles": [], "name": "General"},
        {"text": "LQS brief for manager A", "manager_roles": [MANAGER_A], "name": "LQS-brief"},
    ]
    with patch("app.services.claude_analysis.get_supabase", return_value=_mock_db(prompts)):
        assert get_active_prompt(manager_id=None) == "general fallback prompt"


def test_matches_correct_manager_among_several():
    prompts = [
        {"text": "prompt for B", "manager_roles": [MANAGER_B], "name": "SM-B"},
        {"text": "prompt for A", "manager_roles": [MANAGER_A], "name": "SM-A"},
    ]
    with patch("app.services.claude_analysis.get_supabase", return_value=_mock_db(prompts)):
        assert get_active_prompt(manager_id=MANAGER_A) == "prompt for A"
        assert get_active_prompt(manager_id=MANAGER_B) == "prompt for B"


def test_returns_none_when_no_active_prompts_exist():
    with patch("app.services.claude_analysis.get_supabase", return_value=_mock_db([])):
        assert get_active_prompt(manager_id=MANAGER_A) is None


def test_returns_none_instead_of_raising_on_db_error():
    db = MagicMock()
    db.table.side_effect = RuntimeError("connection refused")
    with patch("app.services.claude_analysis.get_supabase", return_value=db):
        assert get_active_prompt(manager_id=MANAGER_A) is None
