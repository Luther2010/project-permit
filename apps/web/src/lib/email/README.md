# Email Service

This directory contains email functionality for sending daily permit updates to premium users.

## Setup

### AWS SES Configuration

1. **Create AWS Account** (if you don't have one)
   - Go to https://aws.amazon.com/
   - Create an account

2. **Set up SES**
   - Go to AWS Console → Simple Email Service (SES)
   - Verify your sender email address (or domain)
   - Request production access (if in sandbox mode)

3. **Create IAM User**
   - Go to IAM → Users → Create User
   - Attach policy: `AmazonSESFullAccess` (or create custom policy with minimal permissions)
   - Create access key (Access Key ID and Secret Access Key)

4. **Environment Variables**

Add these to your `.env` file:

```env
# AWS SES Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
SES_FROM_EMAIL=noreply@yourdomain.com
```

**Note:** Make sure `SES_FROM_EMAIL` is verified in AWS SES.

## Usage

### Manual Script

Send an email for permits on a specific date using the command-line script:

```bash
pnpm exec dotenv -e .env -- tsx scripts/send-daily-permits.ts <email> <date>
```

**Parameters:**
- `email` (required): Email address to send to
- `date` (required): Date in YYYY-MM-DD format

**Example:**
```bash
pnpm exec dotenv -e .env -- tsx scripts/send-daily-permits.ts user@example.com 2025-10-27
```

The script will:
1. Query permits applied on the specified date
2. Generate email content with permit list
3. Send email via AWS SES
4. Print success/error messages

**Note:** If no permits are found for the date, the email will not be sent.

### Automated Daily Cron Job

The system automatically sends daily emails at 8 AM (configured via Vercel Cron Jobs).

**How it works:**
- Runs daily at 8:00 AM UTC (configured in `vercel.json`)
- Queries permits applied on the previous day
- Sends emails to all premium users with active subscriptions
- Only sends if there are permits for that day
- Skips sending if no permits or no premium users

**Cron Endpoint:**
- `GET /api/cron/send-daily-permits`
- **Automatically secured**: Vercel adds `x-vercel-cron` header to legitimate cron requests
- **Manual testing**: Use `CRON_SECRET` for local/manual testing

**Security:**
- Vercel Cron Jobs are automatically authorized (Vercel adds `x-vercel-cron` header)
- Manual requests require `CRON_SECRET` (for testing)
- Random users cannot access the endpoint (no header, no secret = rejected)

**Environment Variables for Cron:**
```env
CRON_SECRET=your_random_secret_here  # Optional: for manual testing only
```

**Manual Testing:**
```bash
# Using query parameter
curl "https://permitpulse.us/api/cron/send-daily-permits?secret=your_secret"

# Using Authorization header
curl -H "Authorization: Bearer your_secret" https://permitpulse.us/api/cron/send-daily-permits

# Using custom header
curl -H "x-cron-secret: your_secret" https://permitpulse.us/api/cron/send-daily-permits
```

**Vercel Cron Configuration:**
The cron job is configured in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/send-daily-permits",
      "schedule": "0 8 * * *"
    }
  ]
}
```

Schedule format: `minute hour day month weekday`
- `0 8 * * *` = 8:00 AM UTC every day

## Files

- `ses-client.ts`: AWS SES client setup and email sending function
- `templates/daily-permits.ts`: Email template generation (HTML and plain text)
- `README.md`: This file

## Testing

1. Make sure your sender email is verified in AWS SES
2. For sandbox mode, the recipient email must also be verified
3. Use the manual script with a verified email address
4. Check AWS SES console for sending statistics

## Next Steps

- [x] Set up daily cron job to send emails automatically
- [ ] Add email preferences (opt-in/opt-out)
- [ ] Add bounce/complaint handling
- [ ] Add email analytics tracking
