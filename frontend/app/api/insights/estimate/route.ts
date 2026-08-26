import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireRole } from "@/lib/api-auth";
import { adminSupabase, fetchRange, toContextLines } from "../route";
import { anthropicKeyInsights } from "@/lib/anthropic-keys";

const CHARS_PER_TOKEN = 4; // fallback only, if the count_tokens call itself fails

// Real conversation data (transcripts included) never reaches the browser — /api/dashboard
// deliberately omits `transcript` to keep its payload light. So the Insights page can't
// compute an accurate pre-flight token count client-side; it asks this endpoint instead,
// which runs the exact same fetch + prompt-assembly the real POST handler uses, then asks
// Claude's own (free) count_tokens endpoint for the real number — a chars/4 guess systematically
// undercounts Cyrillic text (real BPE tokens run ~2 chars/token here, not 4), which is exactly
// why the estimate for Insight #8 showed ~194k while the actual bill was ~353k input tokens.
export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const {
    dateFrom, dateTo, managerIds, services, kinds, type, dataSource,
  }: {
    dateFrom: string; dateTo: string; managerIds: string[];
    services?: string[]; kinds?: string[];
    type: "all" | "call" | "meeting"; dataSource: "results" | "transcripts";
  } = body;

  const db = adminSupabase();
  const { data: conversations, error } = await fetchRange(db, dateFrom, dateTo, type, managerIds, services ?? [], kinds ?? []);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const promptContext = toContextLines(conversations ?? [], dataSource);
  // Mirrors the real POST handler's user-message wrapping (minus the actual question text,
  // which this endpoint doesn't have yet — negligible next to transcript volume).
  const userMessage = `Дані розмов (${conversations?.length ?? 0} розмов, період ${dateFrom} — ${dateTo}):\n\n${promptContext}\n\nПитання: [питання керівника]`;

  let inputTokens: number;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKeyInsights() });
    const count = await anthropic.messages.countTokens({
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: userMessage }],
    });
    inputTokens = count.input_tokens;
  } catch {
    inputTokens = Math.ceil(userMessage.length / CHARS_PER_TOKEN);
  }

  return NextResponse.json({ convCount: conversations?.length ?? 0, inputTokens });
}
