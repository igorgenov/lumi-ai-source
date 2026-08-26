import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export type Role = "owner" | "admin" | "pm" | "viewer";

async function getUserRole(email: string): Promise<Role> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(url, key);
    const { data } = await supabase.from("managers").select("role").eq("email", email).single();
    if (data?.role) return data.role as Role;
  } catch { /* fall through */ }

  // Fallback: OWNER_EMAILS env var → owner
  const ownerEmails = (process.env.OWNER_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
  if (ownerEmails.includes(email)) return "owner";

  // Fallback: ADMIN_EMAILS env var → admin
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
  if (adminEmails.includes(email)) return "admin";

  return "viewer";
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email?.endsWith("@inweb.ua")) return false;

      // If the admin added this user with no name yet, backfill it from their Google profile once.
      // The avatar, unlike the name, is refreshed on EVERY login — so a changed Google photo
      // shows up in the app right away instead of staying stuck on whatever was there at first sign-in.
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(url, key);
        const picture = (profile as { picture?: string }).picture;

        if (profile.name) {
          await supabase.from("managers").update({ name: profile.name }).eq("email", profile.email).or("name.is.null,name.eq.");
        }
        if (picture) {
          await supabase.from("managers").update({ avatar_url: picture }).eq("email", profile.email);
        }
      } catch { /* non-critical — login still proceeds */ }

      return true;
    },
    async jwt({ token, user }) {
      const now = Math.floor(Date.now() / 1000);
      const lastCheck = (token.roleCheckedAt as number) ?? 0;
      const stale = now - lastCheck > 300; // re-fetch every 5 minutes
      if (user || !token.role || stale) {
        token.role = await getUserRole(token.email!);
        token.roleCheckedAt = now;
      }

      // "Останній вхід в Lumi" for the Команда page — a JWT session can persist for
      // weeks without a fresh sign-in, so this can't be recorded only on signIn(). Piggy-backs
      // on the same 5-minute staleness window as the role check above (not every request) —
      // frequent enough for a "давно не заходив" badge measured in days, cheap enough to not
      // hammer the DB on every page navigation.
      if (stale && token.email) {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
          const supabase = createClient(url, key);
          await supabase.from("managers").update({ last_active_at: new Date().toISOString() }).eq("email", token.email);
        } catch { /* non-critical — never block the session over this */ }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: Role }).role = token.role as Role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};
