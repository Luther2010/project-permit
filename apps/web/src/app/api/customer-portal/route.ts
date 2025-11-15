import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import Stripe from "stripe";
import { prisma } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

/**
 * Create a Stripe Customer Portal session for subscription management
 * 
 * Users can:
 * - Cancel subscription
 * - Update payment method
 * - View billing history
 * - Update billing information
 */
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

    // Check if user has a Stripe customer ID
    if (!user.subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    // Create Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.subscription.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL}/upgrade`,
    });

    return NextResponse.json({
      url: portalSession.url,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error creating customer portal session:", message);
    return NextResponse.json(
      { error: `Failed to create portal session: ${message}` },
      { status: 500 }
    );
  }
}

