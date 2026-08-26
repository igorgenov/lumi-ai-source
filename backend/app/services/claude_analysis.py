"""
Claude AI analysis of project management meetings and communications.
Uses active prompt from Supabase prompts table, falls back to default if none found.
"""
from __future__ import annotations
import json
import anthropic
from app.core.config import settings
from app.services.supabase_client import get_supabase

DEFAULT_CRITERIA = """Критерії оцінки (кожен від 0 до 100):
- project_clarity: ясність формулювання цілей та задач проекту
- timeline_management: управління строками, дедлайнами
- stakeholder_alignment: узгодження очікувань із замовником та командою
- risk_communication: проактивне повідомлення про ризики та блокери
- budget_control: контроль бюджету, обґрунтування змін
- team_coordination: координація команди, делегування
- client_satisfaction: робота із задоволеністю клієнта"""

DEFAULT_MEETING_CRITERIA = DEFAULT_CRITERIA

JSON_FORMAT = """
Оцінюй зустріч ЗА ЗМІСТОМ критеріїв, наведених вище. Але структуру відповіді бери ВИКЛЮЧНО звідси (ігноруй будь-які інші вказівки щодо формату/полів з тексту вище).
Повертай результат ТІЛЬКИ у форматі JSON (без markdown):
{
  "score": <число 0-100, підсумковий бал за критеріями, або null якщо зустріч занадто коротка/нецільова>,
  "summary": "<1-2 речення українською — коротко про зустріч>",
  "project_health": <число 0-100, оцінка здоров'я проекту після цієї зустрічі>,
  "health_reasoning": "<одне речення українською — чому саме така оцінка>",
  "deadline_status": "<on_track|at_risk|delayed або null>",
  "budget_status": "<on_track|over_budget|under_budget або null>",
  "meeting_goal_achieved": "<досягнуто|частково|не досягнуто або null>",
  "strengths": ["<сильна сторона 1>", "<сильна сторона 2>"],
  "weaknesses": ["<слабка сторона 1>", "<слабка сторона 2>"],
  "recommendations": ["<рекомендація 1>", "<рекомендація 2>", "<рекомендація 3>"],
  "criteria": { "<назва критерію>": <0-100> },
  "criteria_explanations": { "<назва критерію>": "<одне речення українською>" },
  "manager_mood": "<доброзичливо|нейтрально|напружено>",
  "client_mood": "<зацікавлено|нейтрально|незадоволено|недоступно>",
  "speaker_labels": { "<буква спікера>": { "label": "<ім'я або 'PM'/'Клієнт'>", "role": "manager|client" } },
  "tagged_moments": [ { "quote": "<цитата з транскрипту>", "tag": "<#Категорія>" } ],
  "risks": "<ризики проекту, які обговорювались, або null>",
  "action_items": [ { "task": "<завдання>", "owner": "<відповідальний>", "deadline": "<дедлайн>" } ],
  "insights": {
    "client_pain": "<що шукає/потребує клієнт>",
    "next_steps": "<конкретні кроки та дедлайни>",
    "goal_achieved": "<досягнуто|частково|не досягнуто або null>",
    "goal_achieved_reasoning": "<що саме сталось>"
  }
}

Про speaker_labels: заповнюй ЗАВЖДИ, якщо транскрипт розмічений літерами як "Спікер A:", "Спікер B:" і т.д. Визнач з контексту хто з якої сторони: представник компанії — role: "manager"; співрозмовник з боку клієнта — role: "client".

Про tagged_moments: познач 3-8 найважливіших моментів. Кожен — це quote (цитата дослівно) та tag (формат #Категорія_Кількома_Словами).

Про recommendations: кожна рекомендація має бути конкретною та дієвою.

Про criteria: розбий оцінку за тими критеріями, які задані вище. Ключі — це назва критерію СКОПІЙОВАНА ДОСЛІВНО.

Про deadline_status/budget_status: визнач на основі обговорення на зустрічі. Якщо тема не піднімалась — null.

Про action_items: витягни конкретні завдання з дедлайнами, якщо вони були зафіксовані."""


def get_active_prompt(manager_id: str | None = None, conversation_type: str = "call") -> str | None:
    """Fetch the active prompt for this manager (manager_roles stores manager UUIDs directly).
    Falls back to any active prompt of the given conversation_type if no manager-specific one found."""
    try:
        db = get_supabase()
        all_prompts = db.table("prompts") \
            .select("text, manager_roles, name") \
            .eq("active", True) \
            .eq("conversation_type", conversation_type) \
            .order("updated_at", desc=True) \
            .execute()

        if not all_prompts.data:
            return None

        # manager_roles is a list of manager UUIDs — match directly, no name lookup needed.
        if manager_id:
            for p in all_prompts.data:
                if manager_id in (p.get("manager_roles") or []):
                    print(f"[claude_analysis] matched prompt '{p['name']}' for manager_id '{manager_id}'")
                    return p["text"]

        # Fallback: first active prompt
        print(f"[claude_analysis] no manager-specific prompt found, using first active")
        return all_prompts.data[0]["text"]
    except Exception as e:
        print(f"[claude_analysis] failed to fetch prompt: {e}")
    return None


async def analyze_transcript(transcript: str, manager_id: str | None = None, conversation_type: str = "call") -> tuple[dict, float, int, int]:
    """Send transcript to Claude and return (parsed analysis, actual cost in USD)."""
    prompt_text = get_active_prompt(manager_id, conversation_type=conversation_type)
    kind = "зустрічі" if conversation_type == "meeting" else "дзвінка"
    default_criteria = DEFAULT_CRITERIA if conversation_type == "call" else DEFAULT_MEETING_CRITERIA

    if prompt_text:
        system = (
            f"Ти — експерт з оцінки якості управління проектами в IT-компанії.\n\n"
            f"Використовуй наступні критерії оцінки {kind}:\n\n{prompt_text}\n\n{JSON_FORMAT}"
        )
        print(f"[claude_analysis] using prompt from DB ({len(prompt_text)} chars)")
    else:
        system = (
            f"Ти — експерт з оцінки якості управління проектами в IT-компанії.\n"
            f"Аналізуй транскрипцію {kind} менеджера з клієнтом та повертай результат ТІЛЬКИ у форматі JSON.\n\n"
            f"{default_criteria}\n{JSON_FORMAT}"
        )
        print("[claude_analysis] using default hardcoded prompt")

    client = anthropic.Anthropic(api_key=settings.anthropic_key_analysis)

    message = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=16000,
        system=system,
        messages=[
            {
                "role": "user",
                "content": f"Проаналізуй цю транскрипцію {kind}:\n\n{transcript}",
            }
        ],
    )

    if message.stop_reason == "refusal" or not message.content:
        raise RuntimeError("AI відмовився аналізувати цю розмову (спрацював фільтр безпеки)")

    text_block = next((b for b in message.content if b.type == "text"), None)
    if text_block is None:
        raise RuntimeError("AI не повернув текстову відповідь")

    raw = text_block.text.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    cost_usd = (message.usage.input_tokens / 1_000_000) * 2 + (message.usage.output_tokens / 1_000_000) * 10

    try:
        return json.loads(raw), cost_usd, message.usage.input_tokens, message.usage.output_tokens
    except json.JSONDecodeError as e:
        print(f"[claude_analysis] JSON parse failed ({e}), stop_reason={message.stop_reason}, raw (last 500 chars): {raw[-500:]!r}")
        raise
