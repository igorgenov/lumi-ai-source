import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/lib/auth";

const BACKEND_URL = "https://inweb-sales-backend-871800563077.europe-west1.run.app";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: manager } = await adminSupabase()
    .from("managers")
    .select("id")
    .eq("email", session.user.email)
    .maybeSingle();
  if (!manager) return NextResponse.json({ error: "Тебе не знайдено як менеджера в Lumi" }, { status: 404 });

  const res = await fetch(`${BACKEND_URL}/api/meetings/drive-oauth/disconnect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MEETINGS_POLL_SECRET ? { "x-webhook-secret": process.env.MEETINGS_POLL_SECRET } : {}),
    },
    body: JSON.stringify({ manager_id: manager.id }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ error: data?.detail ?? "Не вдалося відключити" }, { status: res.status });
  return NextResponse.json(data);
}
