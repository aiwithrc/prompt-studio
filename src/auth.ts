import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig, REMEMBER_MAX_AGE_SEC, SESSION_ONLY_MAX_AGE_SEC } from "@/auth.config";
import { sql } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string } & DefaultSession["user"];
    remember?: boolean;
    issuedAt?: number;
  }
}

const Credentials_ = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  remember: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember", type: "text" },
      },
      async authorize(raw) {
        const parsed = Credentials_.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, remember } = parsed.data;

        // AUTH-07: 5 attempts per minute per email.
        const limit = rateLimit(`login:${email}`, 5, 60_000);
        if (!limit.ok) throw new Error("RateLimited");

        const [row] = await sql<{ id: string; email: string; password_hash: string }[]>`
          select id, email, password_hash from users where email = ${email}
        `;
        // Always run a bcrypt compare so response time does not reveal whether the account exists.
        const hash = row?.password_hash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
        const good = await bcrypt.compare(password, hash);
        if (!row || !good) return null;
        // Object.assign keeps the extra `remember` flag without tripping the excess-property check on User.
        return Object.assign({ id: row.id, email: row.email }, { remember: remember === true || remember === "true" });
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: REMEMBER_MAX_AGE_SEC },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.remember = (user as { remember?: boolean }).remember !== false;
        token.issuedAt = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.uid ?? "");
      session.remember = token.remember !== false;
      session.issuedAt = typeof token.issuedAt === "number" ? token.issuedAt : 0;
      // Session-only logins expire after SESSION_ONLY_MAX_AGE_SEC even though the cookie is persistent.
      const age = Math.floor(Date.now() / 1000) - session.issuedAt;
      if (!session.remember && age > SESSION_ONLY_MAX_AGE_SEC) {
        return { ...session, user: undefined as unknown as typeof session.user };
      }
      return session;
    },
  },
});
