import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { requireRole } from "@/lib/api-auth";
import { countsTowardAiScore, NEEDS_ATTENTION_THRESHOLD } from "@/lib/utils";
import { anthropicKeyDigest } from "@/lib/anthropic-keys";

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
function fmtShort(d: Date) { return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`; }

// Renders a signed delta vs. the previous period, e.g. " (▲8)" / " (▼3%)" / "" when unchanged or no prior data.
function delta(cur: number, prev: number, hasPrevData: boolean, suffix: string = ""): string {
  if (!hasPrevData) return "";
  const diff = cur - prev;
  if (diff === 0) return "";
  const arrow = diff > 0 ? "▲" : "▼";
  return ` (${arrow}${Math.abs(diff)}${suffix})`;
}

type ReportContent = {
  aiScore: boolean; callCount: boolean; conversion: boolean;
  topManagers: boolean; lowScoreManagers: boolean; aiRecommendations: boolean;
};

type Conv = {
  id: string; date: string; status: string; service: string | null; conversation_kind: string | null; type: string;
  manager_id: string | null;
  ai_analysis: { score?: number; summary?: string; strengths?: string[]; weaknesses?: string[] }[] | null;
  manager: { name: string; role: string }[] | null;
};

const DASHBOARD_URL = "https://lumi.inweb.ua";

function summarize(all: Conv[], convType: string = "all") {
  const analyzed = all.filter(c => c.status === "analyzed");
  // countsTowardAiScore always excludes chats (conversation_kind is always "Telegram
  // чат", never Брифування/Презентація КП) — right for a mixed report, but on a
  // chat-only report it zeroed out avgScore/hasScores entirely even when every chat had
  // a real score, hiding the "Середній AI-бал" line for a reason that doesn't apply here.
  const targeted = analyzed.filter(c => convType === "chat" || countsTowardAiScore(c));
  const scores = targeted.map(c => (Array.isArray(c.ai_analysis) ? c.ai_analysis[0]?.score : (c.ai_analysis as any)?.score)).filter((s): s is number => typeof s === "number" && s > 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const nonTargeted = analyzed.filter(c => c.service === "Не цільова").length;
  const targetedPct = analyzed.length ? Math.round(((analyzed.length - nonTargeted) / analyzed.length) * 100) : 0;
  const callCount = all.filter(c => c.type === "call").length;
  const meetingCount = all.filter(c => c.type === "meeting").length;
  const chatCount = all.filter(c => c.type === "chat").length;
  return { total: all.length, analyzed: analyzed.length, avgScore, hasScores: scores.length > 0, nonTargeted, targetedPct, callCount, meetingCount, chatCount };
}

// Grounds the AI conclusion in actual per-conversation summaries/strengths/weaknesses from this
// period — not just the aggregate numbers — so it can call out real recurring patterns.
async function generateAiSummary(
  cur: ReturnType<typeof summarize>, prev: ReturnType<typeof summarize>, hasPrevData: boolean,
  mgrs: { name: string; avg: number; total: number; scoredCount: number }[], all: Conv[],
  convType: string = "all",
): Promise<{ conclusion: string; recommendation: string; costUsd: number } | null> {
  // conclusion is pre-formatted Telegram HTML (manager names bolded, one paragraph per
  // manager) — built from structured tool input below, not a single escaped text blob,
  // so names stand out visually instead of getting lost in a wall of text.
  if (cur.analyzed === 0 || !anthropicKeyDigest()) return null;

  // countsTowardAiScore gates on conversation_kind ∈ {Брифування, Презентація КП} — the
  // right filter for a MIXED report, where a chat/follow-up/etc shouldn't dilute the
  // call/meeting score narrative. But Telegram chats always carry kind "Telegram чат",
  // so on a chat-ONLY report this filter matched literally nothing, every single time,
  // silently falling back to the generic "перегляньте AI Коучинг" line even though the
  // chats DO have real ai_analysis (score/summary/strengths/weaknesses) — that score is
  // just intentionally excluded from the cross-type aggregate elsewhere, not absent
  // (caught live 2026-08-17: a 22-chat report with 100% real analysis came out empty).
  const convLines = all
    .filter(c => c.status === "analyzed" && (convType === "chat" || countsTowardAiScore(c)))
    .slice(0, 40)
    .map(c => {
      const a = Array.isArray(c.ai_analysis) ? c.ai_analysis[0] : (c.ai_analysis as any);
      const mgrInfo = Array.isArray(c.manager) ? c.manager[0] : (c.manager as any);
      // Same owner/admin exclusion as the mgrMap leaderboard above — don't let a
      // covering owner/admin's one-off conversation surface in the AI narrative either.
      if (mgrInfo?.role && mgrInfo.role !== "pm" && mgrInfo.role !== "viewer") return null;
      const mgrName = mgrInfo?.name;
      if (!a) return null;
      return `- ${mgrName ?? "?"} (${a.score ?? "?"}/100): ${a.summary ?? ""} Сильні: ${(a.strengths ?? []).join("; ") || "—"}. Слабкі: ${(a.weaknesses ?? []).join("; ") || "—"}.`;
    })
    .filter(Boolean)
    .join("\n");

  if (!convLines) return null;

  const periodNoun = convType === "call" ? "дзвінків" : convType === "meeting" ? "зустрічей" : convType === "chat" ? "Telegram-чатів" : "розмов";
  const breakdown = convType === "all" ? ` (${cur.callCount} дзвінків, ${cur.meetingCount} зустрічей)` : "";
  const statsBlock = `Поточний період: ${cur.total} ${periodNoun}${breakdown}, середній бал ${cur.avgScore}/100, ціль. дзвінків ${cur.targetedPct}%.
${hasPrevData ? `Попередній період: ${prev.total} розмов, середній бал ${prev.avgScore}/100, ціль. дзвінків ${prev.targetedPct}%.` : "Даних за попередній період немає."}
Команда за середнім балом: ${mgrs.map(m => `${m.name} — ${m.avg} (${m.scoredCount} оцінених розмов)`).join(", ")}.`;

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKeyDigest() });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1536,
      system: `Ти — AI-аналітик відділу продажів агентства Inweb. На основі підсумкової статистики та коротких резюме розмов за період формуєш висновок для керівниці відділу продажів. Пиши українською, по суті, без води. Спирайся ТІЛЬКИ на надані дані — не вигадуй фактів. Якщо є дані за попередній період — обов'язково відзнач конкретну динаміку (що покращилось/погіршилось і, якщо видно з даних, чому). Виклич інструмент provide_summary.`,
      messages: [{ role: "user", content: `${statsBlock}\n\nРозмови за період:\n${convLines}` }],
      tools: [{
        name: "provide_summary",
        description: "Повертає короткий висновок по команді продажів за період.",
        input_schema: {
          type: "object",
          properties: {
            overview: { type: "string", description: "1-2 речення: загальна динаміка команди — обсяг, ціль, середній бал і чому саме так. Без імен менеджерів (вони йдуть окремо в byManager)." },
            byManager: {
              type: "array",
              description: "Один запис на кожного менеджера, який згадується у висновку (не обов'язково всі менеджери — лише ті, по кому є що сказати).",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Ім'я менеджера ТОЧНО як у наданих даних" },
                  text: { type: "string", description: "Конкретний висновок по цьому менеджеру: сильні/слабкі сторони, патерн, що повторюється. Без загальних фраз." },
                },
                required: ["name", "text"],
              },
            },
            recommendation: { type: "string", description: "Одна конкретна дія для керівниці на наступний тиждень" },
          },
          required: ["overview", "byManager", "recommendation"],
        },
      }],
      tool_choice: { type: "tool", name: "provide_summary" },
    });
    if (response.stop_reason === "max_tokens") {
      console.error("[send] AI summary truncated at max_tokens — response likely incomplete");
    }
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) {
      console.error("[send] AI summary: no tool_use block in response, stop_reason:", response.stop_reason);
      return null;
    }
    const input = toolUse.input as { overview?: string; byManager?: { name: string; text: string }[]; recommendation?: string };
    if (!input.overview || !input.byManager || !input.recommendation) {
      console.error("[send] AI summary: missing fields in tool input, stop_reason:", response.stop_reason, "input:", JSON.stringify(input).slice(0, 300));
      return null;
    }
    const conclusion = [
      escapeHtml(input.overview),
      ...input.byManager.map(m => `<b>${escapeHtml(m.name)}</b> — ${escapeHtml(m.text)}`),
    ].join("\n\n");
    // Claude Sonnet 5 intro pricing ($2/$10 per 1M tokens) — same rate used elsewhere for cost tracking.
    const costUsd = (response.usage.input_tokens / 1_000_000) * 2 + (response.usage.output_tokens / 1_000_000) * 10;
    return { conclusion, recommendation: input.recommendation, costUsd };
  } catch (e) {
    console.error("[send] AI summary failed:", e);
    return null;
  }
}

async function buildReportText(content: ReportContent, periodLabel: string, frequency: string = "weekly", managerIds: string[] = [], convType: string = "all"): Promise<string> {
  const supabase = db();

  // Fetch conversations for the relevant period + an equal-length prior period for deltas
  const now = new Date();
  const isWeekly = frequency === "weekly" || frequency === "daily";
  const daysBack = isWeekly ? 7 : 30;
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - daysBack);
  const fromStr = `${fromDate.getFullYear()}-${pad2(fromDate.getMonth() + 1)}-${pad2(fromDate.getDate())}`;
  const prevFromDate = new Date(fromDate);
  prevFromDate.setDate(fromDate.getDate() - daysBack);
  const prevFromStr = `${prevFromDate.getFullYear()}-${pad2(prevFromDate.getMonth() + 1)}-${pad2(prevFromDate.getDate())}`;

  const { data: rawConvs, error: convError } = await supabase
    .from("conversations")
    .select("id, date, status, service, conversation_kind, type, manager_id, manager:managers(name, role), ai_analysis(score, summary, strengths, weaknesses)")
    .order("date", { ascending: false });

  if (convError) {
    throw new Error(`DB error: ${convError.message}`);
  }
  console.log("[send] total convs from DB:", rawConvs?.length ?? 0, "fromStr:", fromStr, "managerIds:", managerIds, "convType:", convType);

  // Filter client-side — avoids timezone issues with DB filtering
  function matchesFilters(c: any) {
    if (managerIds.length > 0 && !managerIds.includes(c.manager_id)) return false;
    if (convType !== "all" && c.type !== convType) return false;
    return true;
  }
  const allRaw = (rawConvs ?? []).filter((c: any) => c.date && c.date.slice(0, 10) >= fromStr && matchesFilters(c));
  const prevRaw = (rawConvs ?? []).filter((c: any) => c.date && c.date.slice(0, 10) >= prevFromStr && c.date.slice(0, 10) < fromStr && matchesFilters(c));

  console.log("[send] filtered convs:", allRaw.length, "prev period:", prevRaw.length);

  const all = allRaw as unknown as Conv[];
  const prevAll = prevRaw as unknown as Conv[];
  const cur = summarize(all);
  const prev = summarize(prevAll);
  const hasPrevData = prevAll.length > 0;

  // Manager stats (id kept so low-score entries can link to the manager's profile).
  // `total` is every conversation regardless of kind (Фідбек, Технічне уточнення,
  // Крос-продаж included) — only `scoredCount`/`scores` are Брифування/Презентація КП,
  // the same subset the average is computed from. Showing `total` next to the avg
  // score (as this report did until 2026-07-27) pairs a bigger, unrelated conversation
  // count with a score computed from a much smaller sample, e.g. "18 дзвінків, 54
  // балів" when only 8 of those 18 were ever scored.
  const mgrMap: Record<string, { name: string; scores: number[]; total: number; scoredCount: number }> = {};
  for (const c of all) {
    const mgrInfo = Array.isArray(c.manager) ? c.manager[0] : (c.manager as any);
    const mgrName = mgrInfo?.name;
    // Same role filter as the "Команда" page — owner/admin sending a message in a
    // client's chat (e.g. covering for someone) isn't "their" client, and listing them
    // in a leaderboard next to real sales managers is misleading (caught live
    // 2026-08-17: owner + an admin appeared in "Топ менеджери" for chats they'd only
    // stepped into to cover a manager, not actual accounts of their own).
    if (mgrInfo?.role && mgrInfo.role !== "pm" && mgrInfo.role !== "viewer") continue;
    if (!c.manager_id || !mgrName) continue;
    if (!mgrMap[c.manager_id]) mgrMap[c.manager_id] = { name: mgrName, scores: [], total: 0, scoredCount: 0 };
    mgrMap[c.manager_id].total++;
    const cScore = Array.isArray(c.ai_analysis) ? c.ai_analysis[0]?.score : (c.ai_analysis as any)?.score;
    // Same chat-report exception as convLines below — countsTowardAiScore always
    // excludes chats (by conversation_kind), which is right for a MIXED report but
    // would zero out every manager's score on a chat-ONLY report.
    if ((convType === "chat" || countsTowardAiScore(c)) && typeof cScore === "number" && cScore > 0) {
      mgrMap[c.manager_id].scores.push(cScore);
      mgrMap[c.manager_id].scoredCount++;
    }
  }
  const mgrs = Object.entries(mgrMap).map(([id, m]) => ({
    id, name: m.name, scoredCount: m.scoredCount,
    avg: m.scores.length ? Math.round(m.scores.reduce((a, b) => a + b, 0) / m.scores.length) : 0,
    total: m.total,
  })).sort((a, b) => b.avg - a.avg);

  const scoreEmoji = (s: number) => s >= 80 ? "🟢" : s >= 60 ? "🟡" : "🔴";

  const aiSummary = content.aiRecommendations
    ? await generateAiSummary(cur, prev, hasPrevData, mgrs, all, convType)
    : null;

  if (aiSummary) {
    try {
      await supabase.from("report_costs").insert({ cost_usd: aiSummary.costUsd });
    } catch (e) {
      console.error("[send] failed to log report AI cost (migration applied?):", e);
    }
  }

  const rangeLabel = `${fmtShort(fromDate)} – ${fmtShort(now)}`;

  const lines: string[] = [];
  // No "Lumi AI —" prefix — the bot/chat itself is already clearly Lumi AI, and the
  // report's own emoji (📞/💬, set via its name in Settings) already distinguishes it.
  lines.push(`<b>${escapeHtml(periodLabel)}</b>`);
  lines.push(`<i>${rangeLabel}</i>`);
  lines.push("");

  if (content.callCount) {
    const icon = convType === "chat" ? "💬" : "📞";
    const noun = convType === "call" ? "Дзвінків" : convType === "meeting" ? "Зустрічей" : convType === "chat" ? "Telegram-чатів" : "Розмов";
    lines.push(`${icon} <b>${noun} за період:</b> ${cur.total}${delta(cur.total, prev.total, hasPrevData)}`);
    if (convType === "all") {
      // "Розмов за період" (cur.total) counts calls+meetings+chats together — this
      // breakdown used to only decompose into calls/meetings, silently leaving chats
      // out of it (caught live 2026-08-17: a report said "45" total with 15+8=23 shown
      // here, no indication the other 22 were Telegram chats at all).
      const parts = [`Дзвінки: ${cur.callCount}`, `Зустрічі: ${cur.meetingCount}`];
      if (cur.chatCount) parts.push(`Telegram-чати: ${cur.chatCount}`);
      lines.push(`   ↳ ${parts.join(" · ")}`);
    }
    lines.push(`✅ <b>Проаналізовано:</b> ${cur.analyzed} (${cur.total ? Math.round((cur.analyzed / cur.total) * 100) : 0}%)`);
  }

  if (content.aiScore && cur.hasScores) {
    lines.push(`${scoreEmoji(cur.avgScore)} <b>Середній AI-бал:</b> ${cur.avgScore}/100${delta(cur.avgScore, prev.avgScore, hasPrevData && prev.hasScores)}`);
  }

  if (content.conversion) {
    // Always said "дзвінків" regardless of convType — misleading on a chat-only report
    // (caught alongside the same-cause bug above, 2026-08-17).
    const targetedNoun = convType === "call" ? "дзвінків" : convType === "meeting" ? "зустрічей" : convType === "chat" ? "чатів" : "розмов";
    const convDelta = delta(cur.targetedPct, prev.targetedPct, hasPrevData, "%").replace(/^ \(|\)$/g, "");
    const parenParts = [convDelta, `${cur.nonTargeted} не цільових`].filter(Boolean);
    lines.push(`🎯 <b>Цільових ${targetedNoun}:</b> ${cur.targetedPct}% (${parenParts.join(", ")})`);
  }

  // mgrs.length counts every conversation, scored or not — chats never get a score at
  // all (countsTowardAiScore excludes them by design), so a chat-only report would list
  // every manager at "0 балів (0 оцінених розмов)" instead of hiding a section that has
  // nothing real to show (caught live 2026-08-17).
  const scoredMgrs = mgrs.filter(m => m.scoredCount > 0);
  if (content.topManagers && scoredMgrs.length > 0) {
    lines.push("");
    lines.push("🏆 <b>Топ менеджери:</b>");
    scoredMgrs.slice(0, 3).forEach((m, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
      lines.push(`${medal} ${escapeHtml(m.name)} — ${m.avg} балів (${m.scoredCount} оцінених розмов)`);
    });
  }

  if (content.lowScoreManagers && scoredMgrs.length > 0) {
    // No slice(0, 3) here — unlike "Топ менеджери" (a leaderboard, capping is fine), this
    // section exists specifically to flag everyone at risk. Capping it silently dropped
    // real low scorers whenever most of the team fell under the threshold in one period.
    const low = scoredMgrs.filter(m => m.avg > 0 && m.avg < NEEDS_ATTENTION_THRESHOLD);
    if (low.length > 0) {
      lines.push("");
      lines.push(`⚠️ <b>Потребують уваги</b> <i>(бал нижче ${NEEDS_ATTENTION_THRESHOLD})</i>:`);
      low.forEach(m => {
        lines.push(`• <a href="${DASHBOARD_URL}/team/${m.id}">${escapeHtml(m.name)}</a> — ${m.avg} балів`);
      });
    }
  }

  if (content.aiRecommendations) {
    lines.push("");
    if (aiSummary) {
      lines.push(`🧠 <b>AI-висновок:</b>`);
      lines.push("");
      lines.push(aiSummary.conclusion);
      lines.push("");
      lines.push(`💡 <b>Рекомендація:</b> ${escapeHtml(aiSummary.recommendation)}`);
    } else {
      lines.push("💡 <b>Рекомендація:</b> Перегляньте детальний аналіз у розділі AI Коучинг для персональних рекомендацій кожному менеджеру.");
    }
  }

  lines.push("");
  // Deep-link straight into the filtered list for this exact period/type, instead of a
  // bare dashboard link that made the reader re-pick the date range and type filter
  // themselves right after reading a report that already told them what to look at
  // (caught live 2026-08-17).
  const toStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const convParams = new URLSearchParams({ from: fromStr, to: toStr });
  if (convType !== "all") convParams.set("type", convType);
  lines.push(`🔗 <a href="${DASHBOARD_URL}/conversations?${convParams.toString()}">Переглянути розмови за період</a>`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("x-reports-secret");
  const isScheduler = authHeader && authHeader === process.env.REPORTS_SECRET;
  if (!isScheduler) {
    const session = await requireRole(["owner", "admin"]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { reportId } = await req.json();

  // Load telegram credentials
  const { data: ch } = await db().from("report_channels").select("*").eq("id", "default").single();
  if (!ch?.telegram_token || !ch?.telegram_chat_id) {
    return NextResponse.json({ error: "Telegram не налаштований" }, { status: 400 });
  }

  // Load report config
  const { data: report } = await db().from("scheduled_reports").select("*").eq("id", reportId).single();
  if (!report) return NextResponse.json({ error: "Звіт не знайдено" }, { status: 404 });

  // Always the live DB name, never a caller-supplied override — the Cloud Scheduler
  // job bodies used to hardcode a periodLabel captured at job-creation time, which
  // silently kept sending the OLD title forever after renaming the report in Settings
  // (caught live 2026-08-17: renamed report still went out under its old name).
  const label = report.name;
  const text = await buildReportText(
    report.content as ReportContent, label,
    report.frequency as string,
    (report.manager_ids as string[]) ?? [],
    (report.conv_type as string) ?? "all",
  );

  const tgRes = await fetch(`https://api.telegram.org/bot${ch.telegram_token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: ch.telegram_chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const tgData = await tgRes.json();
  if (!tgData.ok) {
    return NextResponse.json({ error: tgData.description ?? "Telegram API error" }, { status: 400 });
  }

  console.log("[send] report.content:", JSON.stringify(report.content));
  console.log("[send] manager_ids:", JSON.stringify(report.manager_ids));
  console.log("[send] conv_type:", report.conv_type);
  console.log("[send] text preview:", text.slice(0, 200));
  return NextResponse.json({ ok: true });
}
