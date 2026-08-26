import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const BACKEND_URL = "https://inweb-sales-backend-871800563077.europe-west1.run.app";

// Lets an admin paste a Google Drive share link for a meeting recording the automated
// Meetings poller never picked up, and run it through the same download → transcribe
// (AssemblyAI) → analyze (Claude) pipeline the poller uses — just proxies to the
// backend, which does the actual work as a background task and returns immediately.
export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { url, manager_id, client_name, date } = await req.json();
  if (!url?.trim()) return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (!manager_id) return NextResponse.json({ error: "Оберіть менеджера — це обов'язково для обробки за посиланням" }, { status: 400 });
  if (!client_name?.trim()) return NextResponse.json({ error: "client_name is required" }, { status: 400 });

  try {
    const res = await fetch(`${BACKEND_URL}/api/meetings/manual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.MEETINGS_POLL_SECRET ? { "x-webhook-secret": process.env.MEETINGS_POLL_SECRET } : {}),
      },
      body: JSON.stringify({ url: url.trim(), manager_id, client_name: client_name.trim(), date }),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      // Backend sends detail as {error, conversationId} specifically for the
      // "this recording is already in the system" case (409) — pass conversationId
      // through so the UI can offer "open it" / "re-analyze" instead of a dead-end error.
      if (typeof data.detail === "object" && data.detail?.conversationId) {
        return NextResponse.json({ error: data.detail.error, conversationId: data.detail.conversationId }, { status: res.status });
      }
      const detail = typeof data.detail === "string" ? data.detail : data.error ?? "Помилка обробки";
      return NextResponse.json({ error: detail }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Не вдалося зв'язатись із сервером обробки" }, { status: 502 });
  }
}
