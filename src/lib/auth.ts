import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
        (session.user as Record<string, unknown>).isPro = token.isPro ?? false;
        (session.user as Record<string, unknown>).id = token.id;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
