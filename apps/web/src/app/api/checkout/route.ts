import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import Stripe from "stripe";
import { prisma } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

export async function POST() {
  try {
    // Get authenticated user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if user already has active premium subscription
    // Webhooks correctly set plan to PREMIUM/FREEMIUM, so we only need to check plan
    if (user.subscription?.plan === "PREMIUM") {
      return NextResponse.json(
        { error: "User already has premium access" },
        { status: 400 }
      );
    }

    // Get Stripe Price ID from environment (required for subscriptions)
    const stripePriceId = process.env.STRIPE_PRICE_ID;
    if (!stripePriceId) {
      console.error("STRIPE_PRICE_ID environment variable is not set");
      return NextResponse.json(
        { error: "Subscription configuration error" },
        { status: 500 }
      );
    }

    // Create or retrieve Stripe Customer
    let customerId = user.subscription?.stripeCustomerId;
    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;

      // Store customer ID in database
      await prisma.subscription.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          stripeCustomerId: customerId,
        },
        update: {
          stripeCustomerId: customerId,
        },
      });
    }

    // Create Stripe Checkout Session for subscription
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL}/upgrade/cancel`,
      client_reference_id: user.id, // Link session to user
      metadata: {
        userId: user.id,
        userEmail: user.email,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          userEmail: user.email,
        },
      },
    });

    return NextResponse.json({
      url: checkoutSession.url,
    });
  } catch (error: unknown) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

