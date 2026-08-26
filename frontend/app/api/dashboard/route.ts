import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = adminSupabase();

    const [{ data: convs }, { data: mgrs }, { data: historyRows }] = await Promise.all([
      db.from("conversations").select(`
        id, type, status, date, created_at, client_name, client_company, manager_id, duration_seconds, audio_url, service, conversation_kind,
        manager:managers(id, name, email, avatar_url),
        ai_analysis(score, summary, strengths, weaknesses, recommendations)
      `).order("date", { ascending: false }),
      db.from("managers").select("id, name, email, role, position, avatar_url, last_active_at").order("name"),
      // Only Telegram chats get re-analyzed (weekly, as new messages arrive) — each
      // re-analysis snapshots the outgoing result here before overwriting, so a count
      // per conversation is "how many times has this been re-analyzed so far".
      db.from("ai_analysis_history").select("conversation_id"),
    ]);

    const historyCounts = new Map<string, number>();
    for (const row of historyRows ?? []) {
      historyCounts.set(row.conversation_id, (historyCounts.get(row.conversation_id) ?? 0) + 1);
    }
    const convsWithHistory = (convs ?? []).map(c => ({ ...c, analysis_history_count: historyCounts.get(c.id) ?? 0 }));

    return NextResponse.json(
      { conversations: convsWithHistory, managers: mgrs ?? [] },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
