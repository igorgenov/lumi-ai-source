import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { adminSupabase } from "../route";

export const dynamic = "force-dynamic";

// Single saved insight, for the detail page (/insights/[id]) — separated from the main
// list of 50 so a full report (blocks/tables/quotes, sometimes large) isn't fetched for
// every row just to render a compact history card.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminSupabase();
  const BASE_COLS = "id, question, summary, key_findings, recommendations, by_manager, quotes, analyzed_count, date_from, date_to, type, manager_ids, data_source, created_by, created_at";
  // Same column-tier fallback as the list route — older DBs may be missing later-migrated
  // columns (services/kinds/blocks/title/pinned/computed_stats), so degrade gracefully
  // instead of a hard 500 on a not-yet-migrated environment.
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

  let data: any = null, error: any = null;
  for (const cols of COL_TIERS) {
    ({ data, error } = await db.from("insights").select(cols).eq("id", params.id).single());
    if (!error) break;
  }

  if (error || !data) return NextResponse.json({ error: "Insight not found" }, { status: 404 });
  return NextResponse.json({ insight: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { pinned } = await req.json();
  const db = adminSupabase();
  const { error } = await db.from("insights").update({ pinned: !!pinned }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
