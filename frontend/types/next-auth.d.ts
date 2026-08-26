import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "owner" | "admin" | "manager" | "viewer";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "owner" | "admin" | "manager" | "viewer";
  }
}
