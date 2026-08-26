import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function GET() {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await db()
    .from("scheduled_reports")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reports = (data ?? []).map(r => ({
    id: r.id, name: r.name, frequency: r.frequency,
    dayOfWeek: r.day_of_week, dayOfMonth: r.day_of_month,
    time: r.time, channels: r.channels, content: r.content, active: r.active,
    managerIds: r.manager_ids ?? [], convType: r.conv_type ?? "all",
  }));
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, name, frequency, dayOfWeek, dayOfMonth, time, channels, content, active, managerIds, convType } = await req.json();
  const { error } = await db().from("scheduled_reports").upsert({
    id, name, frequency,
    day_of_week: dayOfWeek ?? null,
    day_of_month: dayOfMonth ?? null,
    time, channels, content, active,
    manager_ids: managerIds ?? [],
    conv_type: convType ?? "all",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, ...patch } = await req.json();
  const dbPatch: Record<string, unknown> = {};
  if ("name"        in patch) dbPatch.name         = patch.name;
  if ("frequency"   in patch) dbPatch.frequency    = patch.frequency;
  if ("dayOfWeek"   in patch) dbPatch.day_of_week  = patch.dayOfWeek;
  if ("dayOfMonth"  in patch) dbPatch.day_of_month = patch.dayOfMonth;
  if ("time"        in patch) dbPatch.time         = patch.time;
  if ("channels"    in patch) dbPatch.channels      = patch.channels;
  if ("content"     in patch) dbPatch.content       = patch.content;
  if ("active"      in patch) dbPatch.active        = patch.active;
  if ("managerIds"  in patch) dbPatch.manager_ids = patch.managerIds;
  if ("convType"    in patch) dbPatch.conv_type   = patch.convType;

  const { error } = await db().from("scheduled_reports").update(dbPatch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  const { error } = await db().from("scheduled_reports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
