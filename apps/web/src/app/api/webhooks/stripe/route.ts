import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Disable body parsing for webhooks (Stripe needs raw body)
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "No signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Get user ID from metadata or client_reference_id
        const userId = session.metadata?.userId || session.client_reference_id;
        
        if (!userId) {
          console.error("No user ID found in checkout session");
          break;
        }

        // Calculate validUntil date (1 month from now)
        const validUntil = new Date();
        validUntil.setMonth(validUntil.getMonth() + 1);

        // Update or create subscription
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: "PREMIUM",
            validUntil,
          },
          update: {
            plan: "PREMIUM",
            validUntil,
            updatedAt: new Date(),
          },
        });

        console.log(`Premium subscription activated for user ${userId}`);
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        // Handle async payment methods (e.g., bank transfers)
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId || session.client_reference_id;
        
        if (!userId) {
          console.error("No user ID found in checkout session");
          break;
        }

        const validUntil = new Date();
        validUntil.setMonth(validUntil.getMonth() + 1);

        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: "PREMIUM",
            validUntil,
          },
          update: {
            plan: "PREMIUM",
            validUntil,
            updatedAt: new Date(),
          },
        });

        console.log(`Premium subscription activated (async payment) for user ${userId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

