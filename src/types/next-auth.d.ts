import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isPro: boolean;
      isSuperAdmin: boolean;
      proExpiresAt: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    isPro?: boolean;
    isSuperAdmin?: boolean;
    proExpiresAt?: string | null;
    proSource?: string;
    entCheckedAt?: number;
  }
}
