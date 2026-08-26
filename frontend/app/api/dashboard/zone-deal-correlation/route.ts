import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/api-auth";
import { SCORE_ZONES, SCORED_KINDS, scoreZone } from "@/lib/utils";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

// A deal in Planfix has no direct link to any specific conversation — it belongs to
// the contragent as a whole. "Won" is read off status_name text since there's no
// dedicated boolean; every is_final deal we've seen in production uses either
// "Успішно реалізовано" (won) or some other final label (lost) — see
// backend/app/services/planfix.py's is_final derivation (status.isActive === false).
function isWon(statusName: string | null): boolean {
  return !!statusName && statusName.includes("Успішно");
}

// Answers the question raised 2026-07-28: does a "green" briefing/КП actually convert
// to a won deal more often than a "red" one? If not, the scoring criteria may not be
// measuring what actually drives a sale. Never shown as certainty — always paired with
// the sample size so a 2-deal "100%" doesn't get mistaken for a real signal.
export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = adminSupabase();

    const [{ data: deals }, { data: convs }] = await Promise.all([
      db.from("contragent_deals").select("contragent_id, status_name, is_final").eq("is_final", true),
      db.from("conversations").select("contragent_id, conversation_kind, ai_analysis(score)").not("contragent_id", "is", null),
    ]);

    // Average scored (Брифування/Презентація КП) score per contragent.
    const scoresByContragent = new Map<string, number[]>();
    for (const c of convs ?? []) {
      if (!c.contragent_id || !SCORED_KINDS.includes((c as any).conversation_kind)) continue;
      const analysis = Array.isArray(c.ai_analysis) ? c.ai_analysis[0] : c.ai_analysis;
      const score = (analysis as { score?: number } | null)?.score;
      if (typeof score !== "number" || score <= 0) continue;
      const list = scoresByContragent.get(c.contragent_id) ?? [];
      list.push(score);
      scoresByContragent.set(c.contragent_id, list);
    }
    const avgByContragent = new Map<string, number>();
    scoresByContragent.forEach((scores, cid) => {
      avgByContragent.set(cid, scores.reduce((a, b) => a + b, 0) / scores.length);
    });

    const buckets: Record<string, { won: number; lost: number }> = Object.fromEntries(SCORE_ZONES.map(z => [z.value, { won: 0, lost: 0 }]));
    let skippedNoScore = 0;
    for (const d of deals ?? []) {
      const avg = avgByContragent.get(d.contragent_id);
      if (avg == null) { skippedNoScore++; continue; }
      const zone = scoreZone(avg).value;
      if (isWon(d.status_name)) buckets[zone].won++;
      else buckets[zone].lost++;
    }

    const result = SCORE_ZONES.map(z => {
      const { won, lost } = buckets[z.value];
      const total = won + lost;
      return { zone: z.value, label: z.label, hex: z.hex, won, lost, total, winRate: total > 0 ? Math.round((won / total) * 100) : null };
    });

    return NextResponse.json({ zones: result, skippedNoScore }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
