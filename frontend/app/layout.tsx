import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Providers } from "./providers";

// Inweb rebrand (Aug 2026): Geist (body, all text) + Unbounded (headings/display) —
// role-for-role replacement of the old Roboto/Montserrat pairing. GeistSans ships as a
// pre-hosted variable font (next/font/local under the hood, via the `geist` package —
// Geist isn't in next/font/google's bundled font list). Unbounded is loaded manually via
// hand-written @font-face rules in globals.css (with size-adjust) instead of next/font/google,
// since this Next.js version's next/font has no size-adjust/declarations API.

export const metadata: Metadata = {
  title: "HuyumiAI — Аналітика розмов",
  description: "Внутрішній інструмент Inweb для AI-аналізу розмов менеджерів з продажу",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-icon.png",
    other: [
      { url: "/icon.png", type: "image/png" },
    ],
  },
};

// Sets the `dark` class before hydration so the page never flashes light-then-dark
// for a returning user — ThemeProvider (client component) can't run early enough on
// its own since React hasn't mounted yet at first paint.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem("lumi-theme");
    var theme = stored === "dark" || stored === "light" ? stored : "light";
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
