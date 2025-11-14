import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import Stripe from "stripe";
import { prisma } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

export async function POST(request: NextRequest) {
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
    if (user.subscription) {
      const now = new Date();
      const isPremium =
        user.subscription.plan === "PREMIUM" &&
        (user.subscription.validUntil === null ||
          user.subscription.validUntil > now);

      if (isPremium) {
        return NextResponse.json(
          { error: "User already has premium access" },
          { status: 400 }
        );
      }
    }

    // Get price from environment or use default
    const price = parseFloat(process.env.PREMIUM_PRICE || "99.99");
    const priceInCents = Math.round(price * 100);

    // Create Stripe Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Premium Plan - Project Permit",
              description: "Unlimited permit access, daily email updates, and priority support",
            },
            unit_amount: priceInCents,
          },
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
    });

    return NextResponse.json({
      url: checkoutSession.url,
    });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

