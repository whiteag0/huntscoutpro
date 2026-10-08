import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { getEntitlement, isHuntScoutSession, normalizeEmail, sessionAccessEnd } from "@/lib/entitlement";

export const dynamic = "force-dynamic";

/**
 * Membership status for the signed-in user only.
 * With ?session_id=cs_..., also confirms that Checkout Session was a paid
 * HuntScout purchase by this user (used by /success).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  let checkout: { paid: boolean } | undefined;

  if (sessionId) {
    if (!stripe || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      checkout = { paid: false };
    } else {
      try {
        const cs = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["payment_intent.latest_charge"],
        });
        const buyer = cs.customer_details?.email || cs.customer_email || cs.metadata?.userEmail || "";
        checkout = {
          paid:
            isHuntScoutSession(cs) &&
            !!sessionAccessEnd(cs) &&
            normalizeEmail(buyer) === normalizeEmail(email),
        };
      } catch {
        checkout = { paid: false };
      }
    }
  }

  const ent = await getEntitlement(email);
  return NextResponse.json({
    isPro: ent.isPro,
    expiresAt: ent.expiresAt,
    ...(checkout ? { checkout } : {}),
  });
}
