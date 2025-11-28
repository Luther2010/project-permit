# Stripe Test to Production Switch - Testing Checklist

## Pre-Switch Preparation

### 1. Environment Variables (Vercel)
- [ ] Switch `STRIPE_SECRET_KEY` from `sk_test_...` to `sk_live_...`
- [ ] Switch `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from `pk_test_...` to `pk_live_...`
- [ ] Update `STRIPE_WEBHOOK_SECRET` to the **live mode** webhook secret (starts with `whsec_`)
- [ ] Verify `STRIPE_PRICE_ID` is the **live mode** price ID (from live mode product)
- [ ] Verify `NEXT_PUBLIC_BASE_URL` points to production domain
- [ ] Verify `NEXTAUTH_URL` points to production domain

### 2. Stripe Dashboard Configuration

#### Products & Pricing
- [ ] Create/verify Premium Plan product exists in **Live Mode**
- [ ] Verify product name: `Premium Plan - Project Permit`
- [ ] Verify price: `$99.99/month` (recurring)
- [ ] Copy **Live Mode** Price ID (starts with `price_`)
- [ ] Update `STRIPE_PRICE_ID` in Vercel with live price ID

#### Webhooks
- [ ] Go to **Developers > Webhooks** in **Live Mode**
- [ ] Create new webhook endpoint OR update existing one:
  - URL: `https://yourdomain.com/api/webhooks/stripe`
  - Events to listen for:
    - ✅ `checkout.session.completed`
    - ✅ `customer.subscription.created`
    - ✅ `customer.subscription.updated`
    - ✅ `customer.subscription.deleted`
    - ✅ `invoice.payment_succeeded`
    - ✅ `invoice.payment_failed`
    - ✅ `checkout.session.async_payment_succeeded` (if needed)
- [ ] Copy the **Signing secret** (starts with `whsec_`)
- [ ] Update `STRIPE_WEBHOOK_SECRET` in Vercel

#### Customer Portal
- [ ] Go to **Settings > Billing > Customer portal** in **Live Mode**
- [ ] Verify business information is correct
- [ ] Verify features enabled:
  - ✅ Allow customers to cancel subscriptions
  - ✅ Allow customers to update payment methods
  - ✅ Allow customers to view invoices
  - ✅ Allow customers to update billing information
- [ ] Verify cancellation behavior (recommended: "Cancel at period end")

## Testing Checklist

### 1. Checkout Flow (New Subscription)

#### Test with Real Card (Small Amount)
- [ ] Navigate to `/pricing` page
- [ ] Click "Upgrade to Premium"
- [ ] Verify redirect to Stripe Checkout (should show live mode)
- [ ] Use a **real credit card** (start with a small test amount if possible)
- [ ] Complete payment
- [ ] Verify redirect to `/pricing/success`
- [ ] Verify user's subscription in database:
  ```sql
  SELECT * FROM "Subscription" WHERE "userId" = '<test-user-id>';
  ```
  - `plan` should be `PREMIUM`
  - `stripeCustomerId` should be set
  - `stripeSubscriptionId` should be set
  - `validUntil` should be `null` (Stripe manages expiration)

#### Verify Webhook Processing
- [ ] Check Vercel logs for webhook events:
  - `checkout.session.completed`
  - `customer.subscription.created`
- [ ] Verify webhook signature validation passes
- [ ] Verify no webhook errors in logs

### 2. Subscription Management (Customer Portal)

- [ ] Navigate to `/pricing` page while logged in as premium user
- [ ] Click "Manage Subscription" or similar button
- [ ] Verify redirect to Stripe Customer Portal
- [ ] Verify you can see:
  - Current subscription details
  - Billing history
  - Payment method
- [ ] Test updating payment method
- [ ] Test viewing invoices
- [ ] Test canceling subscription (if configured)
- [ ] Verify cancellation webhook (`customer.subscription.deleted` or `customer.subscription.updated`)
- [ ] Verify user downgraded to `FREEMIUM` in database

### 3. Webhook Event Testing

#### Test Each Webhook Event Manually (via Stripe Dashboard)
- [ ] **checkout.session.completed**
  - Create a test checkout session in Stripe Dashboard
  - Send test webhook event
  - Verify it's processed correctly

- [ ] **customer.subscription.created**
  - Verify subscription is created in database
  - Verify `stripeSubscriptionId` is stored

- [ ] **customer.subscription.updated**
  - Update subscription in Stripe Dashboard (e.g., change plan)
  - Verify database is updated correctly

- [ ] **customer.subscription.deleted**
  - Cancel subscription in Stripe Dashboard
  - Verify user is downgraded to `FREEMIUM`
  - Verify `stripeSubscriptionId` is cleared

- [ ] **invoice.payment_succeeded**
  - Trigger a successful payment (monthly renewal)
  - Verify subscription remains `PREMIUM`

- [ ] **invoice.payment_failed**
  - Trigger a failed payment
  - Verify subscription status is handled correctly
  - Verify grace period behavior (if configured)

### 4. Subscription Renewal Testing

- [ ] Wait for first monthly renewal (or manually trigger in Stripe Dashboard)
- [ ] Verify `invoice.payment_succeeded` webhook is received
- [ ] Verify subscription remains `PREMIUM` in database
- [ ] Verify user still has premium access

### 5. Payment Failure Handling

- [ ] Simulate payment failure (use Stripe test card `4000 0000 0000 0002` in test mode first, then test with real card that fails)
- [ ] Verify `invoice.payment_failed` webhook is received
- [ ] Verify subscription status handling:
  - `past_due`: Premium access maintained (grace period)
  - `unpaid` or `canceled`: Downgraded to `FREEMIUM`
- [ ] Verify user experience (error messages, notifications)

### 6. Edge Cases

- [ ] Test with user who already has premium (should show error)
- [ ] Test with user who has no subscription record
- [ ] Test with user who has subscription but no `stripeCustomerId`
- [ ] Test webhook signature validation failure (should reject)
- [ ] Test webhook with missing metadata (should handle gracefully)
- [ ] Test concurrent subscription creation (race conditions)

### 7. Database Verification

- [ ] Verify all subscription records have correct `stripeCustomerId`
- [ ] Verify all premium subscriptions have `stripeSubscriptionId`
- [ ] Verify `validUntil` is `null` for Stripe-managed subscriptions
- [ ] Verify no orphaned subscription records

### 8. User Experience Testing

- [ ] Test premium features are accessible after upgrade
- [ ] Test freemium limitations are enforced
- [ ] Test upgrade button visibility (should not show for premium users)
- [ ] Test success/cancel pages display correctly
- [ ] Test error messages are user-friendly

### 9. Monitoring & Logging

- [ ] Set up Stripe Dashboard alerts for:
  - Failed payments
  - Webhook failures
  - Subscription cancellations
- [ ] Monitor Vercel logs for webhook processing errors
- [ ] Set up error tracking (Sentry, etc.) for Stripe-related errors
- [ ] Verify webhook delivery success rate in Stripe Dashboard

### 10. Rollback Plan

- [ ] Document how to switch back to test mode if needed
- [ ] Keep test mode webhook endpoint active (for testing)
- [ ] Keep test mode API keys in a secure location
- [ ] Document process to refund/cancel test transactions

## Post-Switch Verification

### Immediate (First 24 Hours)
- [ ] Monitor all webhook events in Stripe Dashboard
- [ ] Check Vercel logs for any errors
- [ ] Verify first real subscription is created successfully
- [ ] Verify first payment is processed correctly

### First Week
- [ ] Monitor subscription renewals
- [ ] Verify payment success rate
- [ ] Check for any webhook delivery failures
- [ ] Monitor customer support requests

### First Month
- [ ] Verify monthly renewals are working
- [ ] Check subscription cancellation rate
- [ ] Verify payment failure handling
- [ ] Review Stripe Dashboard metrics

## Important Notes

1. **Test Mode vs Live Mode**: Test mode and live mode are completely separate:
   - Different API keys
   - Different webhook endpoints
   - Different products/prices
   - Different customers

2. **Webhook Endpoints**: You may need separate webhook endpoints for test and live mode, or update the existing one when switching.

3. **Refunds**: In live mode, real money is charged. Have a refund process ready for any test transactions.

4. **Customer Data**: Live mode customers are real customers. Ensure GDPR/privacy compliance.

5. **Rate Limits**: Stripe has rate limits. Monitor API usage in production.

6. **Security**: Never commit live API keys to git. Always use environment variables.

## Emergency Contacts

- Stripe Support: https://support.stripe.com
- Stripe Status: https://status.stripe.com
- Your team's on-call contact: [Add contact info]

