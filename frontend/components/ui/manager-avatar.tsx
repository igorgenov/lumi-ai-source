"use client";

import { cn } from "@/lib/utils";

// Real Google photo when available (refreshed on every login — see lib/auth.ts signIn
// callback), falling back to the initials square everyone had before. `className` carries
// both size and shape (e.g. "w-11 h-11 rounded-xl") so each call site keeps its own layout.
export function ManagerAvatar({
  name, avatarUrl, className, style,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={cn("object-cover bg-secondary shrink-0", className)}
        style={style}
      />
    );
  }
  return (
    <div
      className={cn("bg-primary flex items-center justify-center text-white font-black shrink-0", className)}
      style={{ fontFamily: "var(--font-unbounded), sans-serif", ...style }}
    >
      {name?.charAt(0) || "?"}
    </div>
  );
}
