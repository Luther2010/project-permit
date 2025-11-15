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

        // For subscriptions, the subscription is created separately
        // We'll handle it in customer.subscription.created
        if (session.mode === "subscription" && session.subscription) {
          // Subscription will be handled by customer.subscription.created event
          console.log(`Subscription checkout completed for user ${userId}, waiting for subscription.created event`);
          break;
        }

        // For one-time payments (legacy support)
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

        console.log(`Premium subscription activated (one-time payment) for user ${userId}`);
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) {
          console.error("No user ID found in subscription metadata");
          break;
        }

        // Get customer to find user if needed
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        const customerMetadata = customer.deleted ? {} : customer.metadata || {};

        const finalUserId = userId || (customerMetadata.userId as string | undefined);
        if (!finalUserId) {
          console.error("No user ID found in subscription or customer metadata");
          break;
        }

        // Update subscription with Stripe subscription ID
        await prisma.subscription.upsert({
          where: { userId: finalUserId },
          create: {
            userId: finalUserId,
            plan: "PREMIUM",
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer as string,
            validUntil: null, // Stripe manages expiration for subscriptions
          },
          update: {
            plan: "PREMIUM",
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer as string,
            validUntil: null,
            updatedAt: new Date(),
          },
        });

        console.log(`Premium subscription created for user ${finalUserId}, subscription: ${subscription.id}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) {
          // Try to find by stripeSubscriptionId
          const existingSub = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: subscription.id },
          });
          if (!existingSub) {
            console.error(`No subscription found for Stripe subscription ${subscription.id}`);
            break;
          }

          // Update based on subscription status
          if (subscription.status === "active") {
            await prisma.subscription.update({
              where: { id: existingSub.id },
              data: {
                plan: "PREMIUM",
                validUntil: null,
                updatedAt: new Date(),
              },
            });
            console.log(`Subscription ${subscription.id} updated to active`);
          } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
            // User canceled or payment failed - downgrade to freemium
            await prisma.subscription.update({
              where: { id: existingSub.id },
              data: {
                plan: "FREEMIUM",
                validUntil: null,
                updatedAt: new Date(),
              },
            });
            console.log(`Subscription ${subscription.id} canceled/unpaid, downgraded to freemium`);
          }
          break;
        }

        // Update subscription status
        if (subscription.status === "active") {
          await prisma.subscription.update({
            where: { userId },
            data: {
              plan: "PREMIUM",
              validUntil: null,
              updatedAt: new Date(),
            },
          });
        } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
          await prisma.subscription.update({
            where: { userId },
            data: {
              plan: "FREEMIUM",
              validUntil: null,
              updatedAt: new Date(),
            },
          });
        }

        console.log(`Subscription updated for user ${userId}, status: ${subscription.status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) {
          // Try to find by stripeSubscriptionId
          const existingSub = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: subscription.id },
          });
          if (existingSub) {
            await prisma.subscription.update({
              where: { id: existingSub.id },
              data: {
                plan: "FREEMIUM",
                stripeSubscriptionId: null,
                validUntil: null,
                updatedAt: new Date(),
              },
            });
            console.log(`Subscription ${subscription.id} deleted, downgraded to freemium`);
          }
          break;
        }

        // Downgrade to freemium
        await prisma.subscription.update({
          where: { userId },
          data: {
            plan: "FREEMIUM",
            stripeSubscriptionId: null,
            validUntil: null,
            updatedAt: new Date(),
          },
        });

        console.log(`Subscription deleted for user ${userId}, downgraded to freemium`);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
        };
        
        // invoice.subscription can be a string (ID) or Subscription object or null
        const subscriptionId = invoice.subscription 
          ? (typeof invoice.subscription === "string" 
              ? invoice.subscription 
              : invoice.subscription.id)
          : null;
        
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = subscription.metadata?.userId;

          if (!userId) {
            // Try to find by stripeSubscriptionId
            const existingSub = await prisma.subscription.findUnique({
              where: { stripeSubscriptionId: subscriptionId },
            });
            if (existingSub) {
              // Monthly payment succeeded - keep premium active
              await prisma.subscription.update({
                where: { id: existingSub.id },
                data: {
                  plan: "PREMIUM",
                  validUntil: null,
                  updatedAt: new Date(),
                },
              });
              console.log(`Monthly payment succeeded for subscription ${subscriptionId}`);
            }
            break;
          }

          // Monthly payment succeeded - keep premium active
          await prisma.subscription.update({
            where: { userId },
            data: {
              plan: "PREMIUM",
              validUntil: null,
              updatedAt: new Date(),
            },
          });

          console.log(`Monthly payment succeeded for user ${userId}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
        };
        
        // invoice.subscription can be a string (ID) or Subscription object or null
        const subscriptionId = invoice.subscription 
          ? (typeof invoice.subscription === "string" 
              ? invoice.subscription 
              : invoice.subscription.id)
          : null;
        
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);

          // Payment failed - but keep premium access during grace period
          // Stripe will retry payment. Only downgrade if subscription is canceled
          console.log(`Payment failed for subscription ${subscriptionId}, subscription status: ${subscription.status}`);
          
          // If subscription is past_due, we keep premium access (grace period)
          // If subscription is canceled or unpaid, it's handled by subscription.updated/deleted
          if (subscription.status === "past_due") {
            console.log(`Subscription ${subscriptionId} is past_due - keeping premium access during grace period`);
          }
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        // Handle async payment methods (e.g., bank transfers) - legacy support
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
        // These events are normal and don't need handling:
        // - charge.succeeded, payment_method.attached, customer.updated
        // - payment_intent.*, invoice.created, invoice.finalized, invoice.paid
        // - invoice_payment.paid
        // They're logged at debug level to reduce noise
        if (process.env.NODE_ENV === "development") {
          console.log(`[Webhook] Unhandled event type: ${event.type} (this is normal)`);
        }
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

