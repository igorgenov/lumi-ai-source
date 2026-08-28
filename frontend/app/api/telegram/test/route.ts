import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { token, chatId } = await req.json();
  if (!token || !chatId) {
    return NextResponse.json({ error: "token and chatId are required" }, { status: 400 });
  }

  const text = `✅ *HuyumiAI*\n\nПідключення успішне! Цей чат буде отримувати звіти команди.\n\n_Тест відправлено: ${new Date().toLocaleString("uk-UA", { timeZone: "Europe/Kiev" })}_`;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const tgRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });

  const tgData = await tgRes.json();
  if (!tgData.ok) {
    return NextResponse.json(
      { error: tgData.description ?? "Telegram API error" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
