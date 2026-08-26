import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const BACKEND_URL = "https://inweb-sales-backend-871800563077.europe-west1.run.app";

// Lets an admin paste a Planfix task link for a Telegram chat the automated weekly
// poller hasn't picked up yet (auto-sync is currently off) — proxies to the same
// backend endpoint used to manually validate one chat (POST /api/chats/test), which
// fetches every comment on the task, transcribes it into the same "Менеджер:"/
// "Клієнт:" format as the poller, and analyzes it with the chats prompt. Since it
// writes planfix_task_id/planfix_last_comment_at exactly like the automated poller
// does, this chat is indistinguishable from an auto-discovered one once weekly
// re-analysis is switched on — no separate "manually added" flag needed.
export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { url } = await req.json();
  const raw = (url ?? "").trim();
  if (!raw) return NextResponse.json({ error: "Встав посилання на задачу в Planfix" }, { status: 400 });

  const match = raw.match(/(\d+)\s*$/);
  const taskId = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Не вдалося знайти номер задачі в посиланні" }, { status: 400 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/chats/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.MEETINGS_POLL_SECRET ? { "x-webhook-secret": process.env.MEETINGS_POLL_SECRET } : {}),
      },
      // Full history, not just "since last poll" — this chat has never been synced before.
      // Backend clamps this to HISTORY_FLOOR (2026-01-01) regardless — never re-pay to
      // read years-old correspondence just because a chat resumed after going quiet.
      body: JSON.stringify({ task_id: taskId, since: "2020-01-01T00:00:00Z" }),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = typeof data.detail === "string" ? data.detail : data.error ?? "Помилка обробки";
      return NextResponse.json({ error: detail }, { status: res.status });
    }

    if (data.status === "no_new_messages" || data.status === "no_text") {
      return NextResponse.json({ error: "У цій задачі Planfix немає текстових повідомлень для аналізу" }, { status: 400 });
    }
    if (data.status === "stale_skipped") {
      return NextResponse.json({ error: "Останнє повідомлення в цьому чаті занадто старе (>10 робочих днів)" }, { status: 400 });
    }
    if (data.status === "failed") {
      return NextResponse.json({ error: data.error ?? "Аналіз не вдався", conversationId: data.conversation_id }, { status: 500 });
    }
    return NextResponse.json({ conversationId: data.conversation_id });
  } catch {
    return NextResponse.json({ error: "Не вдалося зв'язатись із сервером обробки" }, { status: 502 });
  }
}
