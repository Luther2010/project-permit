# Stripe Payment Integration Setup

## Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Stripe API Keys (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY="sk_test_..."  # Test mode secret key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."  # Test mode publishable key

# Stripe Webhook Secret (get from webhook endpoint settings)
STRIPE_WEBHOOK_SECRET="whsec_..."

# Premium Pricing (optional, defaults to 99.99)
PREMIUM_PRICE="99.99"

# Base URL (optional, defaults to NEXTAUTH_URL)
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

## Setup Steps

### 1. Create Stripe Account
1. Go to https://stripe.com and create an account
2. Navigate to **Developers > API keys**
3. Copy your **Publishable key** and **Secret key**
   - **For development**: Use test mode keys (toggle "Test mode" on in Stripe Dashboard)
   - **For production**: Use live mode keys (toggle "Test mode" off in Stripe Dashboard)

### 2. Set Up Webhook Endpoint

#### For Local Development:
1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Forward webhooks to local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Copy the webhook signing secret (starts with `whsec_`) and add to `.env` as `STRIPE_WEBHOOK_SECRET`
5. **Important**: Use test mode API keys in your local `.env` file

#### For Production (Testing with Test Mode):
1. **Keep Test Mode ON** in Stripe Dashboard (for testing without real charges)
2. Go to **Developers > Webhooks** in Stripe Dashboard
3. Click **Add endpoint**
4. Enter your webhook URL: `https://yourdomain.com/api/webhooks/stripe`
5. Select events to listen for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
6. Copy the **Signing secret** and add to your production environment variables
7. **For testing**: Use test mode API keys (`sk_test_...` and `pk_test_...`) in your Vercel environment variables
8. Test with Stripe test cards (e.g., `4242 4242 4242 4242`) - no real charges will be made

#### For Production (Live Mode - Real Payments):
1. **Switch to Live Mode** in Stripe Dashboard (toggle "Test mode" off)
2. Go to **Developers > Webhooks** in Stripe Dashboard
3. Click **Add endpoint** (or edit existing test mode endpoint)
4. Enter your webhook URL: `https://yourdomain.com/api/webhooks/stripe`
5. Select events to listen for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
6. Copy the **Signing secret** and add to your production environment variables
7. **Important**: Switch to live mode API keys (`sk_live_...` and `pk_live_...`) in your Vercel environment variables
8. **Note**: You'll need separate webhook endpoints for test mode and live mode, or update the existing one when switching

### 3. Test the Flow

1. Use Stripe test cards: https://stripe.com/docs/testing
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
2. Test the checkout flow:
   - Go to `/upgrade` page
   - Click "Upgrade to Premium"
   - Complete payment with test card
   - Verify subscription is activated in database

## Payment Flow

1. User clicks "Upgrade to Premium" on `/upgrade` page
2. `handleUpgrade()` calls `/api/checkout` to create Stripe Checkout session
3. User is redirected to Stripe Checkout page
4. User completes payment
5. Stripe redirects to `/upgrade/success` or `/upgrade/cancel`
6. Stripe sends webhook to `/api/webhooks/stripe`
7. Webhook handler activates premium subscription in database

## Database Updates

When payment is successful, the webhook handler:
- Sets `subscription.plan = "PREMIUM"`
- Sets `subscription.validUntil = 1 month from now`
- Creates subscription record if it doesn't exist

## Testing Webhooks Locally

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed
```

## Production Checklist

- [ ] Switch to live mode API keys in production
- [ ] Set up production webhook endpoint in Stripe Dashboard
- [ ] Add production webhook secret to environment variables
- [ ] Test payment flow with real card (use small amount)
- [ ] Monitor webhook events in Stripe Dashboard
- [ ] Set up error alerts for failed webhooks

