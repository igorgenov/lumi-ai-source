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

// Returns only the caller's own connection status — never exposes other managers'
// tokens/emails, unlike /api/meetings/drive-status (owner/admin only).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: manager } = await adminSupabase()
    .from("managers")
    .select("id, name")
    .eq("email", session.user.email)
    .maybeSingle();
  if (!manager) return NextResponse.json({ error: "Тебе не знайдено як менеджера в Lumi" }, { status: 404 });

  const res = await fetch(`${BACKEND_URL}/api/meetings/drive-oauth/status`, {
    headers: {
      ...(process.env.MEETINGS_POLL_SECRET ? { "x-webhook-secret": process.env.MEETINGS_POLL_SECRET } : {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ error: data?.detail ?? "Не вдалося отримати статус" }, { status: res.status });

  const own = (data.connections ?? []).find((c: { manager_id: string }) => c.manager_id === manager.id) ?? null;
  return NextResponse.json({ managerName: manager.name, connection: own });
}
