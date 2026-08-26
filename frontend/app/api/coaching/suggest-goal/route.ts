import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";
import { countsTowardAiScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

// Suggests a coaching goal from what the AI has actually flagged, instead of an admin
// guessing from memory. Two data sources feed this:
// - ai_analysis.weaknesses (free text) — counts how often each distinct weakness text
//   shows up across a manager's scored (Брифування/Презентація КП) conversations; the
//   single most frequent phrasing becomes the short "Ціль" goal. Best-effort text
//   matching (normalized/trimmed) — two AI-written weaknesses about the same underlying
//   issue can still be phrased slightly differently call to call, so this surfaces the
//   single most common EXACT phrasing, not a semantic cluster.
// - ai_analysis.criteria (named 0-100 scores, consistent rubric every call) — averaged
//   per criterion across all her scored conversations, so a manager with MANY distinct
//   weak spots (not just one recurring phrase) still gets the full picture. Every
//   criterion with an average in the red zone (<55) is surfaced, not just the worst one.
// The admin can always edit the suggested goal/notes before saving.
export async function GET(req: NextRequest) {
  const session = await requireRole(["owner", "admin", "manager"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const managerId = req.nextUrl.searchParams.get("managerId");
  if (!managerId) return NextResponse.json({ error: "managerId required" }, { status: 400 });

  const db = adminSupabase();
  const { data: convs, error } = await db
    .from("conversations")
    .select("service, conversation_kind, date, ai_analysis(weaknesses, criteria)")
    .eq("manager_id", managerId)
    .eq("status", "analyzed");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const weaknessCounts = new Map<string, number>();
  const criteriaScores = new Map<string, number[]>();
  let scoredCount = 0;
  for (const c of convs ?? []) {
    if (!countsTowardAiScore(c as any)) continue;
    const analysis = Array.isArray(c.ai_analysis) ? c.ai_analysis[0] : c.ai_analysis;
    const weaknesses = (analysis as { weaknesses?: unknown } | null)?.weaknesses;
    const criteria = (analysis as { criteria?: unknown } | null)?.criteria;
    let hadData = false;

    if (Array.isArray(weaknesses) && weaknesses.length > 0) {
      hadData = true;
      for (const w of weaknesses) {
        const text = typeof w === "string" ? w.trim() : "";
        if (!text) continue;
        weaknessCounts.set(text, (weaknessCounts.get(text) ?? 0) + 1);
      }
    }
    if (criteria && typeof criteria === "object") {
      hadData = true;
      for (const [name, score] of Object.entries(criteria as Record<string, unknown>)) {
        const num = typeof score === "number" ? score : Number(score);
        if (!Number.isFinite(num)) continue;
        const arr = criteriaScores.get(name) ?? [];
        arr.push(num);
        criteriaScores.set(name, arr);
      }
    }
    if (hadData) scoredCount++;
  }

  if (weaknessCounts.size === 0 && criteriaScores.size === 0) {
    return NextResponse.json({ goal: null, reason: "Немає достатньо оцінених розмов зі слабкими сторонами для підказки" });
  }

  const goal = weaknessCounts.size > 0
    ? `Попрацювати над: ${Array.from(weaknessCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]}`
    : null;
  const topCount = weaknessCounts.size > 0
    ? Array.from(weaknessCounts.values()).sort((a, b) => b - a)[0]
    : undefined;

  const weakCriteria = Array.from(criteriaScores.entries())
    .map(([name, scores]) => ({
      name,
      avg: Math.round(scores.reduce((s, x) => s + x, 0) / scores.length),
      count: scores.length,
    }))
    .filter(c => c.avg < 55)
    // Найчастіші проблеми — першими: менеджеру важливо бачити, з чого починати
    // виправляти (пункт у 25 розмовах впливає сильніше за той, що трапився один раз),
    // а не просто найнижчий середній бал.
    .sort((a, b) => b.count - a.count || a.avg - b.avg);

  const topWeaknesses = Array.from(weaknessCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let notes = "";
  if (weakCriteria.length > 0) {
    notes += "Слабкі критерії (середній бал по всіх оцінених розмовах):\n";
    notes += weakCriteria.map(c => `• ${c.name}: ${c.avg} (у ${c.count} розмов${c.count === 1 ? "і" : "ах"})`).join("\n");
  }
  if (topWeaknesses.length > 1) {
    if (notes) notes += "\n\n";
    notes += "Повторювані зауваження AI:\n";
    notes += topWeaknesses.map(([w, n]) => `• ${w}${n > 1 ? ` (${n}×)` : ""}`).join("\n");
  }

  return NextResponse.json({ goal, occurrences: topCount, scoredCount, weakCriteria, topWeaknesses, notes: notes || null });
}
