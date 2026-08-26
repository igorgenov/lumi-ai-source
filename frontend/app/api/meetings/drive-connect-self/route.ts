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

// Self-service counterpart to /api/meetings/drive-connect (owner/admin, connects ANY
// manager) — any logged-in user can connect only THEIR OWN Drive, resolved from their
// session email, same pattern as /api/team/me. This is the entry point managers
// actually reach, since the full /settings/integrations page (webhook secrets, other
// managers' config) is owner/admin-only.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: manager } = await adminSupabase()
    .from("managers")
    .select("id")
    .eq("email", session.user.email)
    .maybeSingle();
  if (!manager) return NextResponse.json({ error: "Тебе не знайдено як менеджера в Lumi" }, { status: 404 });

  const res = await fetch(`${BACKEND_URL}/api/meetings/drive-oauth/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MEETINGS_POLL_SECRET ? { "x-webhook-secret": process.env.MEETINGS_POLL_SECRET } : {}),
    },
    body: JSON.stringify({ manager_id: manager.id }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) {
    return NextResponse.json({ error: data?.detail ?? "Не вдалося почати авторизацію" }, { status: res.status || 500 });
  }

  return NextResponse.redirect(data.url);
}
