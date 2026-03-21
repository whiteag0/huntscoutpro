import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be signed in to subscribe." },
        { status: 401 }
      );
    }

    const existingCustomers = await stripe.customers.list({
      email: session.user.email,
      limit: 1,
    });

    let customerId: string | undefined;
    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
      const payments = await stripe.paymentIntents.list({
        customer: customerId,
        limit: 5,
      });
      const hasPaid = payments.data.some((p) => p.status === "succeeded");
      if (hasPaid) {
        return NextResponse.json(
          { error: "You already have an active membership." },
          { status: 400 }
        );
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : session.user.email,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "HuntScout Pro \u2014 Annual Membership",
              description:
                "Full access to draw odds, harvest data, point analysis, hunt planner & more for all 50 states.",
            },
            unit_amount: 1499,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
      metadata: {
        userEmail: session.user.email,
        userName: session.user.name || "",
      },
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
