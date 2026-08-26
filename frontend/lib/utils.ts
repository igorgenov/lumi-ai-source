import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Word-level LCS diff — used by the audit log to show exactly what changed in a prompt
// edit (e.g. one fixed typo) instead of just "edited", so a reviewer can tell a trivial
// wording fix from an actual scoring-criteria change at a glance.
export type DiffToken = { type: "same" | "add" | "del"; text: string };
export function wordDiff(before: string, after: string): DiffToken[] {
  // Split on whitespace but KEEP the whitespace as its own token so spacing/newlines
  // survive the diff and re-render identically to the source text.
  const tokenize = (s: string) => s.split(/(\s+)/).filter(t => t.length > 0);
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const tokens: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { tokens.push({ type: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { tokens.push({ type: "del", text: a[i] }); i++; }
    else { tokens.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) { tokens.push({ type: "del", text: a[i] }); i++; }
  while (j < m) { tokens.push({ type: "add", text: b[j] }); j++; }
  return tokens;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDate(dateStr: string): string {
  // Strings without timezone suffix are UTC from the server — add Z so the browser doesn't misread them as local time
  const normalized = /[Z+\-]\d{2}:?\d{2}$/.test(dateStr) ? dateStr : dateStr + "Z";
  const date = new Date(normalized);
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(date);
}

// The three coaching "zones" for a scored conversation (Брифування/Презентація КП
// only — other conversation_kind values never get a numeric score at all). Agreed
// with Aibis 2026-07-27 as the one canonical scale for the AI-бал everywhere in the
// app — replaces an earlier 5-tier gradient that had different boundaries per place.
// Red's upper bound (54) is deliberately also NEEDS_ATTENTION_THRESHOLD below — the
// two concepts are literally the same thing under two names, kept as one constant.
export const SCORE_ZONES = [
  {
    value: "red", label: "Червона", range: "0–54", min: 0, max: 54,
    text: "text-red-600", bg: "bg-red-50 border-red-200 text-red-700", bar: "bg-red-400", hex: "#EF4444",
    description: "Потребує термінового коучингу — пропущено кілька ключових етапів дзвінка/зустрічі одночасно, або є грубі помилки в живій розмові (не реагує на слова клієнта чи перебиває, тисне, дає хибні обіцянки). Сигнал для негайного втручання керівника.",
  },
  {
    value: "yellow", label: "Жовта", range: "55–75", min: 55, max: 75,
    text: "text-amber-600", bg: "bg-amber-50 border-amber-200 text-amber-700", bar: "bg-amber-400", hex: "#FBBF24",
    description: "Прийнятно, але є що підтягнути — базові етапи дзвінка/зустрічі присутні, але один-два з них помітно провисають (напр. потреби з'ясовані поверхнево, або немає чіткої домовленості про наступний крок). Розмова не провальна, але системно не дотягує до порогу якості.",
  },
  {
    value: "green", label: "Зелена", range: "76–100", min: 76, max: 100,
    text: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200 text-emerald-700", bar: "bg-emerald-500", hex: "#10B981",
    description: "Менеджер послідовно пройшов усі ключові етапи дзвінка/зустрічі: з'ясував потреби клієнта, презентував рішення саме під ці потреби, відпрацював заперечення (чи всіх учасників зустрічі), домовився про чіткий наступний крок. Без суттєвих пропусків.",
  },
] as const;

export type ScoreZone = typeof SCORE_ZONES[number];

export function scoreZone(score: number): ScoreZone {
  if (score <= 54) return SCORE_ZONES[0];
  if (score <= 75) return SCORE_ZONES[1];
  return SCORE_ZONES[2];
}

// Ties "needs attention" everywhere (Команда page, Telegram reports) to the same
// red-zone boundary above, instead of separate unexplained magic numbers.
export const NEEDS_ATTENTION_THRESHOLD = 55;

// "давно не заходив" badge threshold on the Команда page — same order of magnitude
// as STALE_DAYS on Контрагенти (14д), but a bit tighter since ignoring the coaching
// tool entirely for a week is already worth a manager's attention.
export const INACTIVE_DAYS_THRESHOLD = 7;

// Q3 target set with Aibis 2026-07-27, simplified 2026-07-28 per feedback: green is a
// FLOOR to exceed ("at least 20%, more is always better" — not a 15-20% range, which
// made overshooting green look like missing a target instead of beating it), red is a
// CEILING not to cross ("no more than 15%"). Yellow is deliberately null — it's
// "залишок" (whatever's left once green/red move), not an independently-targetable
// line the same way green/red are. The real behavior this should drive: fewer red
// (bad) conversations, more green (good) ones — yellow just shrinks as a side effect.
export const ZONE_TARGET: Record<string, { type: "min" | "max"; value: number } | null> = {
  green: { type: "min", value: 20 },
  yellow: null,
  red: { type: "max", value: 15 },
};

// Shrinkage constant for ranking: how many "phantom" conversations at the team
// average a manager's personal average is blended against. Used ONLY to decide
// sort order / rank badges ("Лідер", "Потребує уваги") — the raw avgScore is
// still what's displayed as the number everywhere, so nobody sees a score that
// doesn't match their real calls. Exists because a manager with 1-2 scored
// conversations (e.g. during vacations, low-volume months) could otherwise land
// at the very top or bottom of the leaderboard on a sample too small to trust.
export const RANKING_SHRINKAGE_K = 5;

/** Blends a manager's raw average toward the team average based on sample size —
 * at n=0 the result is exactly teamAvg, at n>>k it converges to rawAvg. Used for
 * ranking/sort order only, never as the displayed score. */
export function shrinkScoreForRanking(rawAvg: number, n: number, teamAvg: number, k: number = RANKING_SHRINKAGE_K): number {
  if (n <= 0) return teamAvg;
  return (n / (n + k)) * rawAvg + (k / (n + k)) * teamAvg;
}

export function scoreColor(score: number): string {
  if (score <= 0) return "text-muted-foreground";
  return scoreZone(score).text;
}

export function scoreBg(score: number): string {
  return scoreZone(score).bg;
}

export function scoreBarColor(score: number): string {
  if (score <= 0) return "bg-secondary";
  return scoreZone(score).bar;
}

// Same 3-zone scale as scoreBarColor, as hex values — for inline SVG stroke/fill colors
// where a Tailwind class can't be used directly (e.g. gauge arcs, chart lines).
export function scoreHexColor(score: number): string {
  return scoreZone(score).hex;
}

// "Ймовірність конверсії" (insights.conversion_probability) is a DIFFERENT metric from
// the 0-100 AI call-quality score — it deliberately uses its own 70/40 thresholds
// ("Високий/Середній/Низький"), not scoreZone's 55/75 call-quality bands. Every place
// that shows this number must use these, not scoreColor/scoreBarColor — mixing the two
// let the same 75% render green on /contragents but amber on a conversation's own page
// (confirmed 2026-07-30).
export function conversionColor(p: number): string {
  if (p >= 70) return "text-emerald-600";
  if (p >= 40) return "text-amber-600";
  return "text-red-500";
}
export function conversionBarColor(p: number): string {
  if (p >= 70) return "bg-emerald-500";
  if (p >= 40) return "bg-amber-400";
  return "bg-red-400";
}

// Older analyses stored mood as a gendered adjective (доброзичлива/доброзичливий) —
// normalize everything to the gender-neutral adverb form for display, since we
// don't know the manager's/client's gender.
const MOOD_NORMALIZE: Record<string, string> = {
  "доброзичлива": "доброзичливо", "доброзичливий": "доброзичливо",
  "нейтральна": "нейтрально", "нейтральний": "нейтрально",
  "напружена": "напружено", "напружений": "напружено",
  "зацікавлена": "зацікавлено", "зацікавлений": "зацікавлено",
  "незадоволена": "незадоволено", "незадоволений": "незадоволено",
  "недоступна": "недоступно", "недоступний": "недоступно",
};
export function normalizeMood(mood: string | null | undefined): string {
  if (!mood) return "";
  return MOOD_NORMALIZE[mood.trim().toLowerCase()] ?? mood;
}

export const CALL_RESULT_LABELS: Record<string, string> = {
  success: "Успішний",
  rejected: "Відмова",
  no_answer: "Не відповів",
  callback: "Передзвонити",
  transferred: "Переведено",
};

// A conversation can touch multiple services (e.g. "SEO,PPC") — stored as a
// delimited string. Splits on comma or the legacy "|" separator some earlier
// AI analyses used, trims, and drops empties.
export function parseServices(service: string | null | undefined): string[] {
  if (!service) return [];
  return service.split(/[,|]/).map(s => s.trim()).filter(Boolean);
}

// "Не цільова" calls (wrong number, no real sales conversation, etc.) should never
// drag down average AI scores anywhere on the site — the manager had no real chance
// to score well on a call that wasn't a briefing in the first place.
export function isNonTargetService(service: string | null | undefined): boolean {
  return parseServices(service).includes("Не цільова");
}

// Managers name their Google Meet recordings freely, with no fixed convention — some
// title them "Inweb & <client>", some just "<client>". Displaying "Inweb & X" as if it
// were the client's identity is confusing (reads like our own agency is the client), so
// strip that prefix everywhere a client name is shown.
export function stripAgencyPrefix(name: string | null | undefined): string {
  if (!name) return "";
  // "x"/"х" (Latin/Cyrillic) is a common "collab-style" connector some managers use
  // instead of "&" ("Inweb x Smobile.ua") — same prefix this strips for "&"/"+".
  return name.replace(/^inweb\s*[&+xх]\s*/i, "").trim();
}

export const SERVICE_COLORS: Record<string, string> = {
  SEO:       "#b45309",
  GEO:       "#0f766e",
  PPC:       "#1d4ed8",
  Analytics: "#7C3AED",
  ASO:       "#b45309",
  ASA:       "#be185d",
  Web:       "#0369a1",
  SMM:       "#be185d",
  Nonprofit:    "#6b7280",
  Інше:         "#6b7280",
  "Не цільова": "#9ca3af",
};

// Classifies WHY a meeting happened — PM conversation types
export const CONVERSATION_KINDS = [
  "Статус-зустріч",
  "Планування спринту",
  "Ретроспектива",
  "Демо/Презентація",
  "Технічне обговорення",
  "Інше",
] as const;

// Same list plus "Telegram чат" for filter dropdowns
export const FILTERABLE_CONVERSATION_KINDS = [
  ...CONVERSATION_KINDS.slice(0, -1),
  "Telegram чат",
  CONVERSATION_KINDS[CONVERSATION_KINDS.length - 1],
] as const;

export const KIND_COLORS: Record<string, string> = {
  "Статус-зустріч":       "#1d4ed8",
  "Планування спринту":   "#7C3AED",
  "Ретроспектива":        "#0f766e",
  "Демо/Презентація":     "#b45309",
  "Технічне обговорення": "#0369a1",
  "Інше":                 "#6b7280",
  "Telegram чат":         "#059669",
};

// For PM: all meeting types can be scored (unlike sales which only scored 2 types)
export const SCORED_KINDS = [...CONVERSATION_KINDS];

// conversation_kind shipped 2026-07-10 (v2.2). Rows from before that still count when
// null (grandfathered — otherwise historical averages would go empty until every old
// row gets reclassified). But the analysis prompt has returned null on purpose ever
// since ("якщо розмова занадто коротка/не цільова — поверни null") — a null kind on
// anything analyzed after launch means the AI judged it too short/untargeted to score,
// same spirit as "Не цільова" service, and must NOT count.
const CONVERSATION_KIND_LAUNCH_DATE = new Date("2026-07-10T00:00:00Z");

export function countsTowardAiScore(conv: { service?: string | null; conversation_kind?: string | null; date?: string | null }): boolean {
  if (isNonTargetService(conv.service)) return false;
  if (conv.conversation_kind == null) {
    if (!conv.date) return true;
    return new Date(conv.date) < CONVERSATION_KIND_LAUNCH_DATE;
  }
  return SCORED_KINDS.includes(conv.conversation_kind);
}

const TRANSLIT: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"h",ґ:"g",д:"d",е:"e",є:"ie",ж:"zh",з:"z",
  и:"y",і:"i",ї:"i",й:"i",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",
  р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",
  щ:"shch",ь:"",ю:"iu",я:"ia",ё:"yo",ъ:"",ы:"y",э:"e"," ":"-",
};
export function generateSlug(name: string): string {
  return name.toLowerCase()
    .split("").map(c => TRANSLIT[c] ?? c).join("")
    .replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export const INWEB_SERVICES: { value: string; label: string }[] = [
  { value: "SEO",       label: "Пошукове просування" },
  { value: "PPC",       label: "Контекстна реклама" },
  { value: "GEO",       label: "Локальне SEO" },
  { value: "Analytics", label: "Веб-аналітика" },
  { value: "ASO",       label: "Оптимізація застосунків" },
  { value: "ASA",       label: "Apple Search Ads" },
  { value: "Web",       label: "Розробка сайтів" },
  { value: "SMM",       label: "Соціальні мережі" },
  { value: "Інше",      label: "Інше" },
];
