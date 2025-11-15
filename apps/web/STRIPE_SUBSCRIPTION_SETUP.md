# Stripe Monthly Subscription Setup

This guide explains how to set up monthly subscriptions with Stripe Customer Portal.

## Prerequisites

- Stripe account (test or live mode)
- Existing Stripe integration (one-time payments working)

## Setup Steps

### 1. Create Stripe Product and Price

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Products
2. Click "Add product"
3. Fill in:
   - **Name**: `Premium Plan - Project Permit`
   - **Description**: `Unlimited permit access, daily email updates, and priority support`
   - **Pricing**: 
     - Type: `Recurring`
     - Price: `$99.99`
     - Billing period: `Monthly`
     - Currency: `USD`
4. Click "Save product"
5. **Copy the Price ID** (starts with `price_xxxxx`) - you'll need this for `STRIPE_PRICE_ID`

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# Stripe Subscription Price ID (from step 1)
STRIPE_PRICE_ID=price_xxxxx
```

**For production:**
- Use the Price ID from your **live mode** Stripe account
- Add `STRIPE_PRICE_ID` to Vercel environment variables

### 3. Configure Stripe Customer Portal

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Settings → Billing → Customer portal
2. Configure the portal:
   - **Business information**: Add your business name and support email
   - **Features to enable**:
     - ✅ Allow customers to cancel subscriptions
     - ✅ Allow customers to update payment methods
     - ✅ Allow customers to view invoices
     - ✅ Allow customers to update billing information
   - **Cancellation behavior**: 
     - Choose "Cancel immediately" or "Cancel at period end" (recommended: "Cancel at period end")
3. Click "Save changes"

### 4. Update Webhook Events

Your webhook should already be configured. Make sure it listens for these events:

**Required events:**
- `checkout.session.completed` (already configured)
- `customer.subscription.created` (new)
- `customer.subscription.updated` (new)
- `customer.subscription.deleted` (new)
- `invoice.payment_succeeded` (new)
- `invoice.payment_failed` (new)

**To add events:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks
2. Click on your webhook endpoint
3. Click "Add events"
4. Select the events listed above
5. Click "Add events"

### 5. Test the Integration

#### Quick Test Setup

1. Make sure `STRIPE_PRICE_ID` is set in your `.env` file
2. Start your dev server: `pnpm dev` (from `apps/web`)
3. For local webhook testing, use Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

#### Test 1: Create a Subscription

1. Go to `http://localhost:3000/upgrade`
2. Sign in (if not already)
3. Click "Upgrade to Premium"
4. Use Stripe test card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/34`)
   - CVC: Any 3 digits (e.g., `123`)
   - ZIP: Any 5 digits (e.g., `12345`)
5. Complete checkout
6. **Verify:**
   - ✅ Redirects to success page
   - ✅ User has premium access (can see unlimited permits)
   - ✅ In Stripe Dashboard → Subscriptions, you see a new subscription
   - ✅ Check application logs for: `Premium subscription created for user <userId>`

#### Test 2: Check Webhook Events

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click on your webhook endpoint
3. Check recent events:
   - `checkout.session.completed` ✅
   - `customer.subscription.created` ✅
4. Check application logs for webhook processing

#### Test 3: Manage Subscription (Customer Portal)

1. As a premium user, go to `/upgrade` page
2. You should see "You're Already Premium!" message
3. Click "Manage Subscription" (also available on home page in top-right)
4. **Verify:**
   - ✅ Opens Stripe Customer Portal
   - ✅ Can see subscription details
   - ✅ Can see payment method
   - ✅ Can see invoices

#### Test 4: Cancel Subscription

1. In Customer Portal (from Test 3), click "Cancel subscription"
2. Choose cancellation option (immediate or end of period)
3. Confirm cancellation
4. **Verify:**
   - ✅ Returns to your app
   - ✅ In Stripe Dashboard → Webhooks, see `customer.subscription.deleted` event
   - ✅ User downgraded to freemium (check database or UI)
   - ✅ Check application logs for: `Subscription deleted for user <userId>, downgraded to freemium`

#### Test 5: Monthly Renewal (Fast Test)

To test monthly renewal without waiting a month:

1. In Stripe Dashboard → Subscriptions → Find your test subscription
2. Click "..." → "Update subscription"
3. Change billing cycle to "1 day" (for testing only)
4. Wait for next billing cycle (1 day later)
5. **Verify:**
   - ✅ `invoice.payment_succeeded` webhook fires
   - ✅ User still has premium access
   - ✅ Check application logs for: `Monthly payment succeeded for user <userId>`

#### Test 6: Payment Failure

1. In Stripe Dashboard → Customers → Find your test customer
2. Click "..." → "Update payment method"
3. Use test card that will fail: `4000 0000 0000 0002`
4. Wait for next billing attempt (or trigger it manually)
5. **Verify:**
   - ✅ `invoice.payment_failed` webhook fires
   - ✅ User keeps premium access during grace period (default: 3 days)
   - ✅ Check application logs for payment failure handling

#### Stripe Test Cards

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Requires authentication**: `4000 0025 0000 3155`
- **Insufficient funds**: `4000 0000 0000 9995`

## How It Works

### Subscription Flow

1. **User clicks "Upgrade to Premium"**
   - Creates Stripe Customer (if doesn't exist)
   - Creates Checkout Session with `mode: "subscription"`
   - Redirects to Stripe Checkout

2. **User completes payment**
   - Stripe creates Subscription
   - `checkout.session.completed` webhook fires
   - `customer.subscription.created` webhook fires
   - Database updated: `plan: PREMIUM`, `stripeSubscriptionId` stored

3. **Monthly renewal**
   - Stripe automatically charges customer
   - `invoice.payment_succeeded` webhook fires
   - Premium access maintained

4. **User cancels**
   - User clicks "Manage Subscription" → Customer Portal
   - User cancels in portal
   - `customer.subscription.deleted` webhook fires
   - User downgraded to freemium (immediately or at period end)

### Database Schema

The `Subscription` model now includes:
- `stripeSubscriptionId`: Stripe subscription ID (for recurring billing)
- `stripeCustomerId`: Stripe customer ID (for Customer Portal)

### Webhook Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Legacy support for one-time payments |
| `customer.subscription.created` | Activate premium, store subscription ID |
| `customer.subscription.updated` | Update subscription status (active/canceled) |
| `customer.subscription.deleted` | Downgrade to freemium |
| `invoice.payment_succeeded` | Maintain premium access (monthly renewal) |
| `invoice.payment_failed` | Log failure, keep access during grace period |

## Troubleshooting

### "STRIPE_PRICE_ID environment variable is not set"

- Make sure `STRIPE_PRICE_ID` is set in `.env` (local) or Vercel environment variables (production)
- Verify the Price ID is correct (starts with `price_`)

### "No active subscription found" when clicking "Manage Subscription"

- User must have a `stripeCustomerId` in the database
- This is created automatically when user subscribes
- If missing, user needs to subscribe first

### Webhook events not firing

- Check Stripe Dashboard → Developers → Webhooks → Your endpoint
- Verify webhook URL is correct
- Check webhook logs for errors
- Ensure webhook secret (`STRIPE_WEBHOOK_SECRET`) is correct

### Subscription not activating after payment

- Check webhook logs in Stripe Dashboard
- Verify `customer.subscription.created` event is being sent
- Check application logs for webhook processing errors
- Ensure `userId` is in subscription metadata

## Migration from One-Time Payments

If you have existing one-time payment subscriptions:

1. They will continue to work (legacy support)
2. New subscriptions will use monthly recurring billing
3. Existing users can upgrade to monthly subscription (they'll get a new subscription)

## Production Checklist

- [ ] Create Product and Price in **live mode** Stripe account
- [ ] Set `STRIPE_PRICE_ID` in Vercel environment variables
- [ ] Configure Customer Portal in Stripe Dashboard
- [ ] Add all required webhook events
- [ ] Test subscription creation
- [ ] Test monthly renewal
- [ ] Test cancellation
- [ ] Test payment failure handling
- [ ] Monitor webhook logs for errors

