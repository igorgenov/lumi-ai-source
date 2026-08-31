import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

// Returns a single conversation with full transcript + analysis.
// Used by the conversation detail page instead of fetching the whole dashboard payload.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = adminSupabase();

    const WITH_EXPLANATIONS = `
        id, type, status, date, client_name, client_company, manager_id, contragent_id, duration_seconds, google_drive_file_id, planfix_task_id,
        transcript, audio_url, vtt_url, service, conversation_kind, call_direction, call_status, manager_talk_pct,
        manager:managers(id, name, email),
        ai_analysis(score, summary, strengths, weaknesses, recommendations, criteria, criteria_explanations, manager_mood, client_mood, speaker_labels, insights, tagged_moments)
      `;
    const FULL = `
        id, type, status, date, client_name, client_company, manager_id, contragent_id, duration_seconds, google_drive_file_id, planfix_task_id,
        transcript, audio_url, vtt_url, service, call_direction, call_status,
        manager:managers(id, name, email),
        ai_analysis(score, summary, strengths, weaknesses, recommendations, criteria, manager_mood, client_mood)
      `;
    const BASE = `
        id, type, status, date, client_name, client_company, manager_id, contragent_id, duration_seconds, google_drive_file_id, planfix_task_id,
        transcript, audio_url, vtt_url, service, call_direction, call_status,
        manager:managers(id, name, email),
        ai_analysis(score, summary, strengths, weaknesses, recommendations)
      `;

    // Try the richest select first; fall back gracefully as older migrations
    // haven't been applied yet so the detail page never breaks.
    let { data, error } = await db.from("conversations").select(WITH_EXPLANATIONS).eq("id", params.id).single();
    if (error) {
      ({ data, error } = await db.from("conversations").select(FULL).eq("id", params.id).single());
    }
    if (error) {
      ({ data, error } = await db.from("conversations").select(BASE).eq("id", params.id).single());
    }

    if (error || !data) {
      return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
    }

    // Normalize ai_analysis (Supabase returns it as an array for the embedded relation)
    const conv: any = data;
    if (Array.isArray(conv.ai_analysis)) conv.ai_analysis = conv.ai_analysis[0] ?? null;
    if (Array.isArray(conv.manager)) conv.manager = conv.manager[0] ?? null;

    // Snapshots of every previous analysis this conversation had before it was
    // overwritten — only Telegram chats currently get re-analyzed (weekly, as new
    // messages arrive), so this is empty for calls/meetings, which analyze once.
    let analysisHistory: any[] = [];
    try {
      const { data: history } = await db
        .from("ai_analysis_history")
        .select("id, score, summary, client_mood, manager_mood, strengths, weaknesses, criteria, insights, analyzed_at")
        .eq("conversation_id", params.id)
        .order("analyzed_at", { ascending: true });
      analysisHistory = history ?? [];
    } catch { /* table not migrated yet — ignore */ }

    return NextResponse.json(
      { conversation: conv, analysisHistory },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
