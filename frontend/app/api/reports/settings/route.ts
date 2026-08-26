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

  const { data } = await db().from("report_channels").select("*").eq("id", "default").single();
  return NextResponse.json({
    telegramToken:    data?.telegram_token    ?? "",
    telegramChatId:   data?.telegram_chat_id   ?? "",
    telegramChatName: data?.telegram_chat_name ?? "",
  });
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { telegramToken, telegramChatId, telegramChatName } = await req.json();
  const { error } = await db().from("report_channels").upsert({
    id: "default",
    telegram_token:     telegramToken    ?? "",
    telegram_chat_id:   telegramChatId   ?? "",
    telegram_chat_name: telegramChatName ?? "",
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
