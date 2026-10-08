import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe, PRODUCT_TAG, ENTITLEMENT_MONTHS } from "@/lib/stripe";
import { getEntitlement, normalizeEmail } from "@/lib/entitlement";

export async function POST() {
  try {
    if (!stripe || process.env.CHECKOUT_PAUSED === "true") {
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable. Please try again later or email support@huntscoutpro.com." },
        { status: 503 }
      );
    }
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be signed in to subscribe." },
        { status: 401 }
      );
    }
    const email = session.user.email;

    const ent = await getEntitlement(email);
    if (ent.source === "error") {
      return NextResponse.json(
        { error: "We couldn't check your membership right now. Please try again in a minute." },
        { status: 503 }
      );
    }
    if (ent.isPro) {
      return NextResponse.json(
        { error: "You already have an active membership.", alreadyPro: true },
        { status: 409 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://www.huntscoutpro.com";
    const metadata = {
      product: PRODUCT_TAG,
      entitlementMonths: String(ENTITLEMENT_MONTHS),
      userEmail: email,
      userName: session.user.name || "",
    };

    const checkoutSession = await stripe.checkout.sessions.create({
      customer_email: email,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "HuntScout Pro — 2-Year Access",
              description:
                "One-time payment. 24 months of full access to draw odds estimates, harvest data, point analysis and the hunt planner. No auto-renewal.",
            },
            unit_amount: 1499,
          },
          quantity: 1,
        },
      ],
      client_reference_id: session.user.id || undefined,
      payment_intent_data: { metadata },
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata,
    }, {
      // Two tabs clicking "buy" within the same 10 minutes get the same session.
      idempotencyKey: `hs-co-${normalizeEmail(email)}-${Math.floor(Date.now() / 600000)}`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
