import { createClient } from "@supabase/supabase-js";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function logActivity(entry: { kind: string; summary: string; href?: string; performedBy?: string | null }) {
  try {
    await adminSupabase().from("activity_log").insert({
      kind: entry.kind,
      summary: entry.summary,
      href: entry.href ?? null,
      performed_by: entry.performedBy ?? null,
    });
  } catch {
    // best-effort logging — never block the underlying action
  }
}
