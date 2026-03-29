import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";

// Super admin credentials — checked server-side only
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "adam@theedgezip.com";
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "Admin";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
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

        // Check against super admin credentials
        if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD) {
          return {
            id: "super-admin",
            name: "Admin",
            email: SUPER_ADMIN_EMAIL,
          };
        }

        return null;
      },
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }

      // Super admin always gets full access
      if (token.email === SUPER_ADMIN_EMAIL) {
        token.isPro = true;
        token.isSuperAdmin = true;
        return token;
      }

      if (account) {
        try {
          const res = await fetch(
            `${process.env.NEXTAUTH_URL}/api/subscription?email=${encodeURIComponent(token.email!)}`,
            { cache: "no-store" }
          );
          if (res.ok) {
            const data = await res.json();
            token.isPro = data.isPro;
          }
        } catch {
          token.isPro = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as unknown as Record<string, unknown>).isPro = token.isPro ?? false;
        (session.user as unknown as Record<string, unknown>).id = token.id;
        (session.user as unknown as Record<string, unknown>).isSuperAdmin = token.isSuperAdmin ?? false;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
