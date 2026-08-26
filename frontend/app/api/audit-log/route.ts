import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

type AuditEntry = {
  kind: "access" | "prompt" | "activity";
  action: string;
  summary: string;
  performed_by: string | null;
  created_at: string;
  href: string;
  versionId?: string;
  promptId?: string;
};

const ROLE_LABEL: Record<string, string> = { owner: "Власник", admin: "Адміністратор", manager: "Менеджер", viewer: "Перегляд" };
const ACCESS_ACTION_LABEL: Record<string, string> = { created: "Додано користувача", role_changed: "Змінено роль", deleted: "Видалено користувача" };

// Combines two separate audit trails (access changes + prompt edit history) into one
// chronological log — "хто і коли редагував критерії чи видав комусь роль admin"
// was previously invisible anywhere in the app.
export async function GET() {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = adminSupabase();
  const entries: AuditEntry[] = [];

  const { data: access } = await db
    .from("access_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  for (const a of access ?? []) {
    const who = a.target_name || a.target_email || "користувача";
    let summary = `${ACCESS_ACTION_LABEL[a.action] ?? a.action}: ${who}`;
    if (a.action === "role_changed") {
      summary += ` (${ROLE_LABEL[a.before_role] ?? a.before_role} → ${ROLE_LABEL[a.after_role] ?? a.after_role})`;
    } else if (a.action === "created" && a.after_role) {
      summary += ` (роль: ${ROLE_LABEL[a.after_role] ?? a.after_role})`;
    }
    entries.push({ kind: "access", action: a.action, summary, performed_by: a.performed_by, created_at: a.created_at, href: "/settings/access" });
  }

  const { data: promptVersions } = await db
    .from("prompt_versions")
    .select("*, prompt:prompts(name)")
    .order("created_at", { ascending: false })
    .limit(300);

  for (const v of promptVersions ?? []) {
    const promptName = Array.isArray(v.prompt) ? v.prompt[0]?.name : v.prompt?.name;
    entries.push({
      kind: "prompt",
      action: "prompt_edited",
      summary: `Відредаговано промт: ${promptName ?? v.name}`,
      performed_by: v.edited_by,
      created_at: v.created_at,
      href: "/prompts",
      versionId: v.id,
      promptId: v.prompt_id,
    });
  }

  // Generic trail for everything else (prompt deletions, Drive folder changes, manual
  // service/kind corrections, manual reanalyze triggers) — best-effort, so a missing
  // table (migration not yet applied) shouldn't break the rest of the log.
  try {
    const { data: activity } = await db
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    for (const a of activity ?? []) {
      entries.push({
        kind: "activity",
        action: a.kind,
        summary: a.summary,
        performed_by: a.performed_by,
        created_at: a.created_at,
        href: a.href ?? "/settings",
      });
    }
  } catch {
    // activity_log table not yet migrated — skip silently
  }

  entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json(entries.slice(0, 500));
}
