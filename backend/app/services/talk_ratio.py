"""
Talk/listen ratio: % of the conversation the manager spoke vs the client.
Computed purely from transcript timestamps (speaker_talk_seconds, gathered at
transcription time) combined with Claude's speaker_labels (letter -> role mapping,
gathered at analysis time) — never fed back into Claude, so it cannot influence
score/criteria. Purely a display stat.
"""
from __future__ import annotations


def compute_manager_talk_pct(
    speaker_talk_seconds: dict[str, float] | None,
    speaker_labels: dict[str, dict] | None,
) -> int | None:
    """Returns manager talk % (0-100, rounded) or None if roles/seconds are missing
    or ambiguous (e.g. no client speaking time at all, or no role mapping yet)."""
    if not speaker_talk_seconds or not speaker_labels:
        return None

    manager_seconds = 0.0
    client_seconds = 0.0
    for letter, seconds in speaker_talk_seconds.items():
        role = (speaker_labels.get(letter) or {}).get("role")
        if role == "manager":
            manager_seconds += seconds
        elif role == "client":
            client_seconds += seconds

    total = manager_seconds + client_seconds
    if total <= 0:
        return None
    return round(manager_seconds / total * 100)
