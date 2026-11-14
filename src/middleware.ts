import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe guard: redirects anonymous users to /login for app pages. API routes check the session themselves.
export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

export const config = {
  // Skip API routes (they return JSON 401 themselves), Next internals and static files (anything with an extension).
  matcher: ["/((?!api|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
