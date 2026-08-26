import { getServerSession } from "next-auth";
import { authOptions, type Role } from "@/lib/auth";

// Server-side role gate for API routes. The UI hides actions per role, but
// that's not a security boundary — every mutating endpoint must also check
// the role itself, otherwise a logged-in viewer could call the API directly.
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return session;
}

export async function requireRole(allowed: Role[]) {
  const session = await requireSession();
  if (!session) return null;
  const role = (session.user as { role?: Role })?.role ?? "viewer";
  if (!allowed.includes(role)) return null;
  return session;
}
