import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { sendOnboardingEmails, cancelOnboardingForPayment } from "@/lib/onboarding";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 400 });
  }

  // This Stripe account is shared with other products; sendOnboardingEmails
  // ignores anything that isn't a paid HuntScout checkout.
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      const result = await sendOnboardingEmails(session);
      if (result === "sent") console.log(`Onboarding emails queued for checkout ${session.id}`);
    } catch (err) {
      // Non-2xx makes Stripe retry; idempotency keys prevent duplicate emails.
      console.error(`Onboarding emails failed for checkout ${session.id}:`, err);
      return NextResponse.json({ error: "Onboarding email failed." }, { status: 500 });
    }
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const obj = event.data.object as Stripe.Charge | Stripe.Dispute;
    const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
    if (pi) await cancelOnboardingForPayment(pi).catch((err) => console.error("Cancel onboarding failed:", err));
  }

  return NextResponse.json({ received: true });
}
