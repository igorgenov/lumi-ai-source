import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import withAuthMiddleware from "next-auth/middleware";

// The old *.run.app URL stays live (Cloud Run always keeps it alongside a custom
// domain mapping) — redirect browser traffic to the canonical lumi.inweb.ua so the
// team only ever sees/shares one link. All /api/* routes are excluded from the
// redirect: Cloud Scheduler (weekly/monthly Telegram reports) hits
// /api/reports/send on the old domain directly and does not follow redirects.
const OLD_HOST = "inweb-sales-frontend-871800563077.europe-west1.run.app";
const CANONICAL_HOST = "lumi.inweb.ua";

// Paths that must never go through the auth check (would otherwise redirect-loop
// on the login page itself, or need to stay reachable without a session).
const AUTH_EXEMPT = /^\/(login|api\/auth|api\/reports\/send|robots\.txt)/;

export default function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  if (host === OLD_HOST && !req.nextUrl.pathname.startsWith("/api/")) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  if (AUTH_EXEMPT.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return (withAuthMiddleware as unknown as (req: NextRequest) => ReturnType<typeof NextResponse.next>)(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.jpg|.*\\.png|.*\\.svg|.*\\.ico).*)"],
};
