import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { requireRole, requireSession } from "@/lib/api-auth";
import { anthropicKeyInsights } from "@/lib/anthropic-keys";
import { isNonTargetService, countsTowardAiScore, parseServices, scoreZone } from "@/lib/utils";

export function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export const CONV_SELECT = `
  id, type, date, client_name, client_company, manager_id, service, conversation_kind,
  transcript, contragent_id,
  manager:managers(id, name),
  ai_analysis(score, summary, strengths, weaknesses, recommendations, client_mood, manager_mood, criteria, insights)
`;

// Real Planfix deal outcomes (won/lost/in progress) per contragent, so questions like
// "why are deals stalling" can be grounded in the actual CRM record for that client
// instead of only what one conversation's AI analysis guessed — a conversation can read
// as promising while the linked deal already died in Planfix, or vice versa.
export async function fetchContragentDeals(db: ReturnType<typeof adminSupabase>, contragentIds: string[]) {
  const map = new Map<string, { name: string | null; deals: { service: string | null; status: string | null; isFinal: boolean }[] }>();
  const ids = Array.from(new Set(contragentIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const { data: contragents } = await db.from("contragents").select("id, name").in("id", ids);
  for (const c of contragents ?? []) map.set(c.id, { name: c.name ?? null, deals: [] });

  const { data: deals } = await db.from("contragent_deals").select("contragent_id, service, status_name, is_final").in("contragent_id", ids);
  for (const d of deals ?? []) {
    const entry = map.get(d.contragent_id);
    if (entry) entry.deals.push({ service: d.service, status: d.status_name, isFinal: !!d.is_final });
  }
  return map;
}

export async function fetchRange(
  db: ReturnType<typeof adminSupabase>,
  dateFrom: string,
  dateTo: string,
  type: "all" | "call" | "meeting",
  managerIds: string[],
  services: string[] = [],
  kinds: string[] = []
) {
  let query = db
    .from("conversations")
    .select(CONV_SELECT)
    .gte("date", dateFrom)
    .lte("date", dateTo + "T23:59:59Z")
    .order("date", { ascending: false });
  if (type !== "all") query = query.eq("type", type);
  if (managerIds && managerIds.length > 0) query = query.in("manager_id", managerIds);
  if (kinds && kinds.length > 0) query = query.in("conversation_kind", kinds);

  const { data, error } = await query;
  // service can be a comma-separated list ("SEO,PPC"), so filtering needs to check for
  // overlap rather than an exact column match — done here in JS after the DB round-trip.
  if (!error && data && services.length > 0) {
    return { data: data.filter((c: any) => parseServices(c.service).some(s => services.includes(s))), error };
  }
  return { data, error };
}

// Real, DB-computed averages (no LLM involved) so the qualitative AI text has hard numbers
// to stand next to, instead of relying purely on Claude's own arithmetic/interpretation.
// Only counts Брифування/Презентація КП toward scoring (same rule as the rest of the app) —
// unless the caller explicitly filtered to a specific conversation_kind, in which case that's
// clearly intentional (e.g. "how did this PM behave in Знайомство з РМ calls") and every
// scored conversation in the filtered set should count.
function computeStats(conversations: any[], kindsFilterActive: boolean) {
  const targeted = conversations.filter((c: any) =>
    !isNonTargetService(c.service) && (kindsFilterActive || countsTowardAiScore(c))
  );
  const byManager = new Map<string, { name: string; total: number; count: number }>();
  let overallTotal = 0, overallCount = 0;

  targeted.forEach((c: any) => {
    const a = Array.isArray(c.ai_analysis) ? c.ai_analysis[0] : c.ai_analysis;
    if (a?.score == null) return;
    overallTotal += a.score;
    overallCount += 1;
    const key = c.manager_id ?? "unknown";
    const name = (c.manager as any)?.name ?? "Невідомо";
    const entry = byManager.get(key) ?? { name, total: 0, count: 0 };
    entry.total += a.score;
    entry.count += 1;
    byManager.set(key, entry);
  });

  return {
    overallAvgScore: overallCount > 0 ? Math.round(overallTotal / overallCount) : null,
    overallCount,
    byManager: Array.from(byManager.values())
      .map(e => ({ name: e.name, avgScore: Math.round(e.total / e.count), count: e.count }))
      .sort((a, b) => b.avgScore - a.avgScore),
  };
}

// Weekly red/yellow/green split over the requested date range — synthesized server-side
// (same "don't leave arithmetic to the AI" principle as computeStats/the period-comparison
// bar_chart below) so a question like "is quality actually improving" gets a real trend,
// not Claude's read of a wall of per-conversation lines. Only meaningful over >=2 weeks —
// a single week has nothing to show a trend across.
function computeZoneTrend(conversations: any[], dateFrom: string, dateTo: string, kindsFilterActive: boolean) {
  const from = new Date(dateFrom + "T00:00:00Z");
  const to = new Date(dateTo + "T00:00:00Z");
  if (Math.round((to.getTime() - from.getTime()) / 86_400_000) < 13) return null;

  const buckets: { label: string; start: Date; end: Date }[] = [];
  for (let cur = new Date(from); cur <= to; cur = new Date(cur.getTime() + 7 * 86_400_000)) {
    const end = new Date(Math.min(cur.getTime() + 6 * 86_400_000, to.getTime()));
    buckets.push({ label: `${cur.getDate()}.${String(cur.getMonth() + 1).padStart(2, "0")}`, start: cur, end });
  }
  if (buckets.length < 2) return null;

  const targeted = conversations.filter((c: any) => !isNonTargetService(c.service) && (kindsFilterActive || countsTowardAiScore(c)));
  const points = buckets.map(b => {
    const bucketEnd = new Date(b.end.getTime() + 86_399_999);
    const counts = { red: 0, yellow: 0, green: 0 };
    let total = 0;
    for (const c of targeted) {
      if (!c.date) continue;
      const d = new Date(c.date);
      if (d < b.start || d > bucketEnd) continue;
      const a = Array.isArray(c.ai_analysis) ? c.ai_analysis[0] : c.ai_analysis;
      if (typeof a?.score !== "number") continue;
      total++;
      counts[scoreZone(a.score).value as "red" | "yellow" | "green"]++;
    }
    return { label: b.label, ...counts, total };
  });
  return points.some(p => p.total > 0) ? points : null;
}

export function toContextLines(
  conversations: any[],
  dataSource: "results" | "transcripts",
  dealsByContragent: Map<string, { name: string | null; deals: { service: string | null; status: string | null; isFinal: boolean }[] }> = new Map()
) {
  // Real Planfix deal status for this client, if a contragent is linked — lets the AI
  // ground "why did this deal stall" in the actual CRM outcome instead of only guessing
  // from how the conversation itself read.
  const dealsLine = (c: any): string => {
    const entry = c.contragent_id ? dealsByContragent.get(c.contragent_id) : undefined;
    if (!entry || entry.deals.length === 0) return "";
    const summary = entry.deals.map(d => `${d.service ?? "угода"}: ${d.status ?? "статус невідомий"}${d.isFinal ? " (завершено)" : ""}`).join("; ");
    return ` | угоди в Planfix: ${summary}`;
  };

  if (dataSource === "results") {
    return conversations.map((c: any) => {
      const a = Array.isArray(c.ai_analysis) ? c.ai_analysis[0] : c.ai_analysis;
      const managerName = (c.manager as any)?.name ?? "Невідомо";
      const date = c.date?.slice(0, 10) ?? "";
      const typeLabel = c.type === "call" ? "Дзвінок" : c.type === "meeting" ? "Зустріч" : c.type;
      const deals = dealsLine(c);
      if (!a) return `[id:${c.id}] [${date}] ${typeLabel} | ${managerName} | клієнт: ${c.client_name ?? "—"} | немає аналізу${deals}`;
      const strengths = (a.strengths ?? []).slice(0, 2).join("; ");
      const weaknesses = (a.weaknesses ?? []).slice(0, 2).join("; ");
      // Previously only score/summary/strengths/weaknesses made it into this context —
      // mood, per-criteria breakdown, and the "Аналітичні висновки" block (client_pain/
      // objections/next_steps/conversion_probability) were already saved per
      // conversation but never reached the AI generating an Insights report, so it was
      // answering questions "blind" to data that already existed.
      const mood = a.client_mood || a.manager_mood
        ? ` | настрій клієнта: ${a.client_mood ?? "—"}, менеджера: ${a.manager_mood ?? "—"}`
        : "";
      const criteria = a.criteria && Object.keys(a.criteria).length > 0
        ? ` | критерії: ${Object.entries(a.criteria).map(([k, v]) => `${k}=${v}`).join(", ")}`
        : "";
      const ins = a.insights ?? {};
      const insightsParts = [
        ins.client_pain && `біль клієнта: ${ins.client_pain}`,
        ins.objections && `заперечення: ${ins.objections}`,
        ins.next_steps && `наступні кроки: ${ins.next_steps}`,
        typeof ins.conversion_probability === "number" && `ймовірність конверсії: ${ins.conversion_probability}%`,
        ins.goal_achieved && `мета розмови: ${ins.goal_achieved}${ins.goal_achieved_reasoning ? ` (${ins.goal_achieved_reasoning})` : ""}`,
      ].filter(Boolean);
      const insightsStr = insightsParts.length ? ` | ${insightsParts.join(" | ")}` : "";
      return `[id:${c.id}] [${date}] ${typeLabel} | ${managerName} | клієнт: ${c.client_name ?? "—"} | бал: ${a.score ?? "—"}/100 | висновок: ${a.summary ?? "—"} | сильні сторони: ${strengths} | слабкі сторони: ${weaknesses}${mood}${criteria}${insightsStr}${deals}`;
    }).join("\n");
  }
  return conversations
    .filter((c: any) => c.transcript)
    .map((c: any) => {
      const managerName = (c.manager as any)?.name ?? "Невідомо";
      const date = c.date?.slice(0, 10) ?? "";
      const typeLabel = c.type === "call" ? "Дзвінок" : c.type === "meeting" ? "Зустріч" : c.type;
      return `=== [id:${c.id}] [${date}] ${typeLabel} | ${managerName} | клієнт: ${c.client_name ?? "—"}${dealsLine(c)} ===\n${c.transcript}`;
    }).join("\n\n");
}

// Creating an insight calls Claude Sonnet — billable. Only owner/admin may trigger it,
// so a manager or viewer can't run up the bill. Viewing past insights (GET) stays open
// to everyone who has the Insights page in their nav (owner/admin/manager/viewer).
export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Тільки власник або адміністратор можуть створювати нові інсайти" }, { status: 403 });

  const body = await req.json();
  const {
    question,
    dateFrom,
    dateTo,
    managerIds,
    services,
    kinds,
    type,
    dataSource,
    comparePrevious,
  }: {
    question: string;
    dateFrom: string;
    dateTo: string;
    managerIds: string[];
    services?: string[];
    kinds?: string[];
    type: "all" | "call" | "meeting";
    dataSource: "results" | "transcripts";
    comparePrevious?: boolean;
  } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const db = adminSupabase();
  const kindsFilterActive = !!(kinds && kinds.length > 0);

  // ── Fetch conversations (current period) ───────────────────────────────────
  const { data: conversations, error: fetchError } = await fetchRange(db, dateFrom, dateTo, type, managerIds, services ?? [], kinds ?? []);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({
      error: "Не знайдено розмов за вибраний період. Спробуй розширити діапазон дат або змінити фільтри.",
    }, { status: 404 });
  }

  // ── Optionally fetch the immediately-preceding period of equal length ──────
  let previousConversations: any[] | null = null;
  let previousRangeLabel: string | null = null;
  if (comparePrevious) {
    const from = new Date(dateFrom + "T00:00:00Z");
    const to = new Date(dateTo + "T00:00:00Z");
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const prevTo = new Date(from.getTime() - 86_400_000);
    const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000);
    const prevDateFrom = prevFrom.toISOString().slice(0, 10);
    const prevDateTo = prevTo.toISOString().slice(0, 10);
    previousRangeLabel = `${prevDateFrom} — ${prevDateTo}`;
    const { data: prevData } = await fetchRange(db, prevDateFrom, prevDateTo, type, managerIds, services ?? [], kinds ?? []);
    previousConversations = prevData ?? [];
  }

  // ── Real, DB-computed stats (grounding for the AI text, not generated by it) ─
  const computedStats = computeStats(conversations, kindsFilterActive);
  const previousComputedStats = previousConversations ? computeStats(previousConversations, kindsFilterActive) : null;

  // ── Real Planfix deal outcomes for any linked contragent (see fetchContragentDeals) ─
  const allContragentIds = [...conversations, ...(previousConversations ?? [])].map((c: any) => c.contragent_id).filter(Boolean);
  const dealsByContragent = await fetchContragentDeals(db, allContragentIds);

  // ── Build context for Claude ───────────────────────────────────────────────

  const promptContext = toContextLines(conversations, dataSource, dealsByContragent);
  if (dataSource === "transcripts" && !promptContext.trim()) {
    return NextResponse.json({
      error: "Транскрипції для обраних розмов відсутні. Спробуй перемкнутись на 'Результати аналізу'.",
    }, { status: 404 });
  }

  let previousBlock = "";
  if (previousConversations) {
    const prevContext = toContextLines(previousConversations, dataSource, dealsByContragent);
    previousBlock = `\n\nПОПЕРЕДНІЙ ПЕРІОД для порівняння (${previousRangeLabel}, ${previousConversations.length} розмов, середній бал ${previousComputedStats?.overallAvgScore ?? "—"}):\n${prevContext || "(немає даних за цей період)"}`;
  }

  // ── Call Claude ────────────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: anthropicKeyInsights() });

  const systemPrompt = `Ти — AI-аналітик відділу продажів агентства Inweb. Аналізуєш розмови менеджерів з клієнтами та надаєш структуровані інсайти.

Твоя задача: відповісти на питання керівника на основі наданих даних розмов. Відповідай українською мовою. Будь конкретним та actionable. Кожна розмова в даних позначена [id:...] — використовуй цей id, якщо треба процитувати конкретну розмову або вказати рядок таблиці/ranked_list.

Якщо в даних розмови є "угоди в Planfix" — це РЕАЛЬНИЙ статус угоди з CRM (виграно/програно/в процесі), а не оцінка AI. Якщо питання стосується причин зриву угод чи конверсії — обов'язково зважай на ці реальні статуси, а не лише на тон самої розмови: розмова може виглядати позитивно, а угода в Planfix вже "Закрито і не реалізовано" (і навпаки).

Якщо в даних розмови є "мета розмови" (досягнуто/частково/не досягнуто) — це ОКРЕМИЙ від бала сигнал: чи розмова досягла своєї практичної мети (наприклад, чи зафіксовано конкретний наступний крок з датою), незалежно від того, наскільки якісно менеджер провів окремі кроки. Розмова може мати високий бал за манеру спілкування, але не досягнути мети — і навпаки. Якщо питання стосується того, чи розмови "працюють"/дають результат, а не лише якості виконання — зважай саме на це поле, а не тільки на score.

title — короткий, змістовний заголовок звіту (5-10 слів), що відображає суть висновку, а не просто повторює питання. Наприклад, не "Аналіз зустрічей презентації КП", а "Що конвертує і що втрачає клієнта на презентаціях КП".
quotes — тільки якщо є транскрипції. Якщо немає — поверни порожній масив. Якщо можеш точно визначити, з якої розмови цитата — вкажи її id у полі conversationId (бери id так, як він написаний у тегу [id:...] біля відповідної розмови), інакше не заповнюй це поле.
byManager — тільки якщо є дані по різних менеджерах.

blocks — масив візуальних блоків. Ти сам вирішуєш, скільки блоків якого типу потрібно для ЦЬОГО конкретного питання — від 0 до десятка, у будь-якому порядку. Не існує обов'язкового набору: обирай лише те, що дійсно допомагає зрозуміти відповідь. Доступні типи (кожен блок — окремий об'єкт з полем "type" + лише полями, що стосуються цього типу):
- "stat" — % або числовий показник з поясненням (statLabel, statValue, statSub?)
- "gauge" — шкала 0..max (gaugeLabel, gaugeValue, gaugeMax, gaugeSub?)
- "bar_chart" — частотний або оціночний барчарт (chartTitle?, chartMode: "count"|"score", chartItems: [{label, value}])
- "pie_chart" — частка/баланс категорій (pieTitle?, pieItems: [{label, value}])
- "ranked_list" — ранжування за впливом 0-100 з трендом (rankedTitle?, rankedItems: [{label, score, trend?: "up"|"down"|"flat", conversationId?}])
- "table" — таблиця з кількома колонками; якщо рядок = патерн, що стосується кількох розмов — перелічи їх у окремій колонці, а не тільки в тексті цитати; якщо рядок = одна розмова — заповни conversationId для переходу (tableTitle?, tableHeaders: [string], tableRows: [{cells: [string], rowType?: "positive"|"negative"|"risk"|"neutral", conversationId?}]). ВАЖЛИВО про rowType: заповнюй його ЛИШЕ якщо в таблиці справді є рядки РІЗНИХ типів (наприклад, і хороші, і погані приклади поруч) — це показує контраст. Якщо таблиця за своєю природою містить лише один тип (наприклад "розмови з найнижчим балом" — вони всі негативні за визначенням), НЕ заповнюй rowType для жодного рядка: однакова позначка в кожному рядку не несе інформації, лише захаращує таблицю.
- "two_column_list" — два протиставлені списки, наприклад ризики/можливості (leftTitle, rightTitle, leftItems: [string], rightItems: [string])
- "theme_section" — тематична секція з підпунктами приклад/ризик/спостереження/цитата (sectionTitle, sectionItems: [{label, text, kind?: "example_positive"|"example_negative"|"risk"|"observation"|"quote", conversationId?}])

Не заповнюй kpis/графіки "про всяк випадок" — тільки те, що реально відповідає на питання. Якщо структура таблиці/списку зі знахідками вже покриває суть — необов'язково додатково дублювати те саме в pie_chart чи gauge.
${previousConversations ? "\nУ даних є ПОТОЧНИЙ і ПОПЕРЕДНІЙ періоди для порівняння — обов'язково відзнач у summary/keyFindings, що саме змінилось (краще/гірше, більше/менше) між періодами, з конкретними числами." : ""}

Реальні (не твої, а пораховані з бази) середні бали для довідки — можеш спиратись на них у тексті: загальний середній бал по ВСІХ розмовах, що потрапили у вибірку за поточними фільтрами (${computedStats.overallAvgScore ?? "—"}, ${computedStats.overallCount} оцінених розмов)${computedStats.byManager.length ? ", по менеджерах: " + computedStats.byManager.map(m => `${m.name} — ${m.avgScore} (${m.count})`).join(", ") : ""}.
ВАЖЛИВО про назву "stat"/"gauge" блоку з цим числом: цей показник — середній бал ПО ВИБІРЦІ, а не обов'язково "по відділу". Якщо у фільтрах вказано конкретного одного менеджера (byManager містить лише одне ім'я) — statLabel/gaugeLabel має називати саме цього менеджера (наприклад "Середній бал Тетяни Тимцунік"), а не "по відділу" чи "по компанії". "По відділу"/"по команді" пиши лише якщо дані дійсно охоплюють кількох менеджерів. Використовуй ЛИШЕ це точне число оцінених розмов (${computedStats.overallCount}) у полі statSub/gaugeSub. НЕ додавай власне уточнення на кшталт "у вибірці N розмов" з іншим числом — це створює суперечність, коли одна цифра вже названа. Якщо хочеш пояснити, чому оцінених розмов менше за загальну кількість завантажених — напиши це звичайним реченням (наприклад, "решта не рахуються за критеріями оцінки"), а не другим числом навпроти першого.

Виклич інструмент provide_insight з результатом аналізу.`;

  const userMessage = `Дані розмов (${conversations.length} розмов, період ${dateFrom} — ${dateTo}):

${promptContext}${previousBlock}

Питання: ${question}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: [{
        name: "provide_insight",
        description: "Повертає структурований результат аналізу розмов менеджерів з клієнтами.",
        input_schema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Загальний висновок (2-4 речення)" },
            keyFindings: { type: "array", items: { type: "string" }, description: "Ключові знахідки" },
            byManager: {
              type: "array",
              description: "Тільки якщо є дані по різних менеджерах, інакше порожній масив",
              items: {
                type: "object",
                properties: { name: { type: "string" }, insight: { type: "string" } },
                required: ["name", "insight"],
              },
            },
            recommendations: { type: "array", items: { type: "string" }, description: "Конкретні рекомендації" },
            quotes: {
              type: "array",
              description: "Тільки якщо є транскрипції, інакше порожній масив",
              items: {
                type: "object",
                properties: {
                  manager: { type: "string" },
                  text: { type: "string" },
                  context: { type: "string" },
                  conversationId: { type: "string", description: "id розмови з тегу [id:...], якщо відомий" },
                },
                required: ["manager", "text", "context"],
              },
            },
            title: { type: "string", description: "Короткий змістовний заголовок звіту, не дублює саме питання" },
            blocks: {
              type: "array",
              description: "Візуальні блоки — обери типи й кількість під конкретне питання, або залиш порожнім",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["stat", "gauge", "bar_chart", "pie_chart", "ranked_list", "table", "two_column_list", "theme_section"],
                  },
                  statLabel: { type: "string" },
                  statValue: { type: "string" },
                  statSub: { type: "string" },
                  gaugeLabel: { type: "string" },
                  gaugeValue: { type: "number" },
                  gaugeMax: { type: "number" },
                  gaugeSub: { type: "string" },
                  chartTitle: { type: "string" },
                  chartMode: { type: "string", enum: ["count", "score"] },
                  chartItems: {
                    type: "array",
                    items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" } }, required: ["label", "value"] },
                  },
                  pieTitle: { type: "string" },
                  pieItems: {
                    type: "array",
                    items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" } }, required: ["label", "value"] },
                  },
                  rankedTitle: { type: "string" },
                  rankedItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" }, score: { type: "number" },
                        trend: { type: "string", enum: ["up", "down", "flat"] },
                        conversationId: { type: "string" },
                      },
                      required: ["label", "score"],
                    },
                  },
                  tableTitle: { type: "string" },
                  tableHeaders: { type: "array", items: { type: "string" } },
                  tableRows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        cells: { type: "array", items: { type: "string" } },
                        rowType: { type: "string", enum: ["positive", "negative", "risk", "neutral"] },
                        conversationId: { type: "string" },
                      },
                      required: ["cells"],
                    },
                  },
                  leftTitle: { type: "string" },
                  rightTitle: { type: "string" },
                  leftItems: { type: "array", items: { type: "string" } },
                  rightItems: { type: "array", items: { type: "string" } },
                  sectionTitle: { type: "string" },
                  sectionItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" }, text: { type: "string" },
                        kind: { type: "string", enum: ["example_positive", "example_negative", "risk", "observation", "quote"] },
                        conversationId: { type: "string" },
                      },
                      required: ["label", "text"],
                    },
                  },
                },
                required: ["type"],
              },
            },
          },
          required: ["summary", "keyFindings", "recommendations"],
        },
      }],
      tool_choice: { type: "tool", name: "provide_insight" },
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) {
      return NextResponse.json({ error: "AI не зміг сформувати структурований звіт. Спробуй переформулювати питання." }, { status: 500 });
    }

    const parsed = toolUse.input as Record<string, any>;

    // Sanitize Claude's output defensively — the tool schema forces a shape, but doesn't
    // guarantee non-empty strings/numbers, and downstream rendering assumes both. Claude
    // occasionally collapses an array field into a single string, wrapping each item in
    // pseudo-XML tags — sometimes clean <item>...</item> pairs, sometimes a stray
    // tool-call-style <parameter name="item">...</parameter> fragment (occasionally with
    // no closing tag at all, running to the end of the string) — split/strip either shape
    // back into a clean list item instead of leaking the raw tag into the UI.
    const TAG_PATTERN = /<item>([\s\S]*?)<\/item>|<parameter\s+name="item">([\s\S]*?)(?:<\/parameter>|$)/g;
    const splitTaggedItems = (s: string): string[] => {
      const matches = Array.from(s.matchAll(TAG_PATTERN)).map(m => (m[1] ?? m[2] ?? "").trim()).filter(Boolean);
      if (matches.length > 0) return matches;
      const cleaned = s.replace(/<\/?item>|<parameter\s+name="[^"]*">|<\/parameter>/g, "").trim();
      return cleaned ? [cleaned] : [];
    };
    const toStringArray = (v: any): string[] => {
      if (Array.isArray(v)) return v.flatMap((x: any) => splitTaggedItems(String(x)));
      if (typeof v === "string") return splitTaggedItems(v);
      return v ? [String(v)] : [];
    };
    const keyFindings = toStringArray(parsed.keyFindings);
    const recommendations = toStringArray(parsed.recommendations);
    const byManager = Array.isArray(parsed.byManager)
      ? parsed.byManager.map((b: any) => ({ name: String(b?.name ?? "—"), insight: String(b?.insight ?? "") }))
      : [];
    const quotes = Array.isArray(parsed.quotes)
      ? parsed.quotes.map((q: any) => ({
          manager: String(q?.manager ?? "—"),
          text: String(q?.text ?? ""),
          context: String(q?.context ?? ""),
          conversationId: typeof q?.conversationId === "string" && q.conversationId ? q.conversationId : undefined,
        }))
      : [];
    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null;

    const BLOCK_TYPES = new Set(["stat", "gauge", "bar_chart", "pie_chart", "ranked_list", "table", "two_column_list", "theme_section"]);
    const str = (v: any) => typeof v === "string" ? v : v == null ? "" : String(v);
    const num = (v: any) => Number(v) || 0;
    const optId = (v: any) => typeof v === "string" && v ? v : undefined;
    const blocks: any[] = Array.isArray(parsed.blocks)
      ? parsed.blocks
          .filter((b: any) => b && BLOCK_TYPES.has(b.type))
          .map((b: any) => {
            switch (b.type) {
              case "stat":
                return { type: "stat", label: str(b.statLabel), value: str(b.statValue), sub: b.statSub ? str(b.statSub) : undefined };
              case "gauge":
                return { type: "gauge", label: str(b.gaugeLabel), value: num(b.gaugeValue), max: num(b.gaugeMax) || 100, sub: b.gaugeSub ? str(b.gaugeSub) : undefined };
              case "bar_chart":
                return {
                  type: "bar_chart", title: b.chartTitle ? str(b.chartTitle) : undefined,
                  mode: b.chartMode === "score" ? "score" : "count",
                  items: Array.isArray(b.chartItems) ? b.chartItems.map((i: any) => ({ label: str(i?.label), value: num(i?.value) })) : [],
                };
              case "pie_chart":
                return {
                  type: "pie_chart", title: b.pieTitle ? str(b.pieTitle) : undefined,
                  items: Array.isArray(b.pieItems) ? b.pieItems.map((i: any) => ({ label: str(i?.label), value: num(i?.value) })) : [],
                };
              case "ranked_list":
                return {
                  type: "ranked_list", title: b.rankedTitle ? str(b.rankedTitle) : undefined,
                  items: Array.isArray(b.rankedItems) ? b.rankedItems.map((i: any) => ({
                    label: str(i?.label), score: num(i?.score),
                    trend: ["up", "down", "flat"].includes(i?.trend) ? i.trend : undefined,
                    conversationId: optId(i?.conversationId),
                  })) : [],
                };
              case "table":
                return {
                  type: "table", title: b.tableTitle ? str(b.tableTitle) : undefined,
                  headers: Array.isArray(b.tableHeaders) ? b.tableHeaders.map(str) : [],
                  rows: Array.isArray(b.tableRows) ? b.tableRows.map((r: any) => ({
                    cells: Array.isArray(r?.cells) ? r.cells.map(str) : [],
                    rowType: ["positive", "negative", "risk", "neutral"].includes(r?.rowType) ? r.rowType : undefined,
                    conversationId: optId(r?.conversationId),
                  })) : [],
                };
              case "two_column_list":
                return {
                  type: "two_column_list", leftTitle: str(b.leftTitle), rightTitle: str(b.rightTitle),
                  left: Array.isArray(b.leftItems) ? b.leftItems.map(str) : [],
                  right: Array.isArray(b.rightItems) ? b.rightItems.map(str) : [],
                };
              case "theme_section":
                return {
                  type: "theme_section", title: str(b.sectionTitle),
                  items: Array.isArray(b.sectionItems) ? b.sectionItems.map((i: any) => ({
                    label: str(i?.label), text: str(i?.text),
                    kind: ["example_positive", "example_negative", "risk", "observation", "quote"].includes(i?.kind) ? i.kind : undefined,
                    conversationId: optId(i?.conversationId),
                  })) : [],
                };
              default:
                return null;
            }
          })
          .filter(Boolean)
      : [];

    // Period-over-period trend isn't left to Claude's arithmetic — synthesize it server-side
    // from the same computedStats already used for grounding, as a small score bar_chart.
    if (previousConversations && previousComputedStats?.overallAvgScore != null && computedStats.overallAvgScore != null) {
      blocks.unshift({
        type: "bar_chart",
        title: "Динаміка середнього балу між періодами",
        mode: "score",
        items: [
          { label: previousRangeLabel ?? "Попередній період", value: previousComputedStats.overallAvgScore },
          { label: `${dateFrom} — ${dateTo}`, value: computedStats.overallAvgScore },
        ],
      });
    }

    // Weekly zone (red/yellow/green) split over the requested period — same
    // server-computed-not-AI-guessed principle, shown whenever the range spans enough
    // weeks to say anything about a trend (see computeZoneTrend above).
    const zoneTrendPoints = computeZoneTrend(conversations, dateFrom, dateTo, kindsFilterActive);
    if (zoneTrendPoints) {
      blocks.unshift({ type: "zone_trend", title: "Тренд зон за період", points: zoneTrendPoints });
    }

    // Claude Sonnet 5 pricing: $2.00 / 1M input tokens, $10.00 / 1M output tokens (intro rate through 2026-08-31, then $3/$15)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = (inputTokens / 1_000_000) * 2 + (outputTokens / 1_000_000) * 10;

    // Save insight to DB — progressively drop newer optional columns if their migrations
    // haven't been applied yet, so the insight always saves rather than silently failing.
    const userEmail = (session as any)?.user?.email ?? null;
    const insightRow = {
      question,
      summary: parsed.summary ?? null,
      key_findings: keyFindings,
      recommendations,
      by_manager: byManager,
      quotes,
      analyzed_count: conversations.length,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      type: type ?? "all",
      manager_ids: managerIds ?? [],
      data_source: dataSource,
      created_by: userEmail,
    };
    const filtersRow = { services: services ?? [], kinds: kinds ?? [] };
    const computedStatsRow = { current: computedStats, previous: previousComputedStats, previousRangeLabel };
    const attempts = [
      { ...insightRow, ...filtersRow, cost_usd: costUsd, blocks, title, pinned: false, computed_stats: computedStatsRow },
      { ...insightRow, ...filtersRow, cost_usd: costUsd, blocks, title },
      { ...insightRow, cost_usd: costUsd, blocks, title, pinned: false, computed_stats: computedStatsRow },
      { ...insightRow, cost_usd: costUsd, blocks, title },
      { ...insightRow, cost_usd: costUsd, pinned: false, computed_stats: computedStatsRow },
      { ...insightRow, cost_usd: costUsd },
      insightRow,
    ];
    for (const attempt of attempts) {
      const { error: insertError } = await db.from("insights").insert(attempt);
      if (!insertError) break;
    }

    return NextResponse.json({
      ok: true,
      analyzedCount: conversations.length,
      dateRange: `${dateFrom} — ${dateTo}`,
      dataSource,
      question,
      costUsd,
      ...parsed,
      title,
      keyFindings,
      recommendations,
      byManager,
      quotes,
      blocks,
      computedStats,
      previousComputedStats,
      previousRangeLabel,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Помилка AI: ${e.message}` }, { status: 500 });
  }
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminSupabase();
  const BASE_COLS = "id, question, summary, key_findings, recommendations, by_manager, quotes, analyzed_count, date_from, date_to, type, manager_ids, data_source, created_by, created_at";
  const COL_TIERS = [
    `${BASE_COLS}, services, kinds, cost_usd, chart_data, table_data, blocks, title, pinned, computed_stats`,
    `${BASE_COLS}, cost_usd, chart_data, table_data, blocks, title, pinned, computed_stats`,
    `${BASE_COLS}, cost_usd, chart_data, table_data, blocks, title, pinned`,
    `${BASE_COLS}, cost_usd, chart_data, table_data, pinned, computed_stats`,
    `${BASE_COLS}, cost_usd, chart_data, table_data, pinned`,
    `${BASE_COLS}, cost_usd, chart_data`,
    `${BASE_COLS}, cost_usd`,
    BASE_COLS,
  ];

  let data: any[] | null = null, error: any = null;
  for (const cols of COL_TIERS) {
    ({ data, error } = await db.from("insights").select(cols).order("created_at", { ascending: false }).limit(50));
    if (!error) break;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pinned insights first (falls back gracefully if `pinned` column isn't selected in this tier)
  const sorted = [...(data ?? [])].sort((a: any, b: any) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return NextResponse.json({ insights: sorted });
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, pinned } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = adminSupabase();
  const { error } = await db.from("insights").update({ pinned: !!pinned }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = adminSupabase();
  // Snapshot before delete — so "who deleted what" survives in Журнал змін even
  // though the insights row itself is gone (same before-content-snapshot
  // principle as prompt_versions, just logged as one summary line here since
  // activity_log has no structured jsonb column for a full block-by-block copy).
  const { data: before } = await db
    .from("insights")
    .select("title, question, created_at, analyzed_count, cost_usd")
    .eq("id", id)
    .single();

  const { error } = await db.from("insights").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const { logActivity } = await import("@/lib/activity-log");
    const label = before?.title || before?.question || id;
    await logActivity({
      kind: "insight_deleted",
      summary: `Видалено звіт Інсайтів: «${label}»${before?.analyzed_count ? ` (${before.analyzed_count} розмов, $${(before.cost_usd ?? 0).toFixed(2)})` : ""}`,
      href: "/insights",
      performedBy: session.user?.email ?? null,
    });
  } catch (le) {
    console.error("[insights] failed to log deletion (activity_log migration applied?):", le);
  }

  return NextResponse.json({ ok: true });
}
