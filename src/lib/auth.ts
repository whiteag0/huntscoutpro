import { timingSafeEqual } from "crypto";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import { getEntitlement, isSuperAdminEmail, normalizeEmail } from "@/lib/entitlement";

// Super admin password login is only enabled when both values are set in the
// environment. There is deliberately no default password.
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
export const adminLoginEnabled = !!SUPER_ADMIN_EMAIL && !!SUPER_ADMIN_PASSWORD;

// How long a Pro / non-Pro result is trusted before we ask Stripe again.
const RECHECK_FREE_MS = 60 * 1000;
const RECHECK_PRO_MS = 12 * 60 * 60 * 1000;
// Floor for client-requested re-checks (useSession().update()).
const RECHECK_UPDATE_MIN_MS = 10 * 1000;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
];

if (adminLoginEnabled) {
  providers.push(
    Credentials({
      name: "Admin Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        if (
          normalizeEmail(email) === normalizeEmail(SUPER_ADMIN_EMAIL!) &&
          safeEqual(password, SUPER_ADMIN_PASSWORD!)
        ) {
          return { id: "super-admin", name: "Admin", email: SUPER_ADMIN_EMAIL };
        }
        return null;
      },
    })
  );
}

export const authConfig: NextAuthConfig = {
  providers,
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
      }

      token.isSuperAdmin = isSuperAdminEmail(token.email);

      // Re-check entitlement at sign-in, when the client asks (e.g. right after
      // checkout), and periodically, so a purchase made after signing in shows up
      // without signing out.
      const checkedAt = typeof token.entCheckedAt === "number" ? token.entCheckedAt : 0;
      const maxAge = token.isPro ? RECHECK_PRO_MS : RECHECK_FREE_MS;
      const sinceCheck = Date.now() - checkedAt;
      const due =
        !!user ||
        (trigger === "update" && sinceCheck > RECHECK_UPDATE_MIN_MS) ||
        sinceCheck > maxAge;

      if (due && token.email) {
        const ent = await getEntitlement(token.email);
        // On a Stripe outage keep the last known status instead of locking people out.
        if (ent.source !== "error") {
          token.isPro = ent.isPro;
          token.proExpiresAt = ent.expiresAt;
          token.proSource = ent.source;
          token.entCheckedAt = Date.now();
        } else {
          // Back off for one interval rather than hammering a struggling Stripe.
          token.entCheckedAt = Date.now();
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? "";
        session.user.isPro = token.isPro === true;
        session.user.isSuperAdmin = token.isSuperAdmin === true;
        session.user.proExpiresAt = (token.proExpiresAt as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
