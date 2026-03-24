import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" })
  : null;

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email || !stripe) { return NextResponse.json({ isPro: false }); }
  try {
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) { return NextResponse.json({ isPro: false }); }
    const customer = customers.data[0];
    const payments = await stripe.paymentIntents.list({ customer: customer.id, limit: 10 });
    const hasPaid = payments.data.some((p) => p.status === "succeeded");
    return NextResponse.json({ isPro: hasPaid });
  } catch (error) {
    console.error("Subscription check error:", error);
    return NextResponse.json({ isPro: false });
  }
}
