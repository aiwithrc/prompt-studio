// Edge-safe Auth.js config (no database imports). Used by middleware. The full config lives in src/auth.ts.
import type { NextAuthConfig } from "next-auth";

export const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

/** "Keep me signed in" off = the session stops being valid after 12 hours (checked in the jwt/session callbacks). */
export const SESSION_ONLY_MAX_AGE_SEC = 12 * 60 * 60;
export const REMEMBER_MAX_AGE_SEC = 30 * 24 * 60 * 60;

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: REMEMBER_MAX_AGE_SEC },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const signedIn = !!auth?.user;
      if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        // Signed-in users do not need the login pages again.
        if (signedIn && (pathname === "/login" || pathname === "/signup")) {
          return Response.redirect(new URL("/generate", request.nextUrl));
        }
        return true;
      }
      return signedIn;
    },
  },
} satisfies NextAuthConfig;
