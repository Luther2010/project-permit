# Vercel Deployment Guide

## Quick Start

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Migrate to PostgreSQL and prepare for Vercel deployment"
   git push
   ```

2. **Go to Vercel Dashboard**:
   - Visit https://vercel.com
   - Sign up/Login
   - Click "Add New Project"

3. **Import your repository**:
   - Connect your GitHub account
   - Select your repository
   - Click "Import"

4. **Configure Project Settings**:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `apps/web` ⚠️ **IMPORTANT: Set this in Vercel dashboard, not in vercel.json**
   - **Build Command**: Will use `vercel.json` config (or you can leave default)
   - **Output Directory**: Will use `vercel.json` config (or `.next` default)
   - **Install Command**: Will use `vercel.json` config (or default)

5. **Set Environment Variables**:
   Click "Environment Variables" and add:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL`: Will be `https://your-app.vercel.app` (set after first deploy)
   - `GOOGLE_CLIENT_ID`: (if using Google OAuth)
   - `GOOGLE_CLIENT_SECRET`: (if using Google OAuth)
   - `LINKEDIN_CLIENT_ID`: (if using LinkedIn OAuth)
   - `LINKEDIN_CLIENT_SECRET`: (if using LinkedIn OAuth)

6. **Deploy**:
   - Click "Deploy"
   - Wait for build to complete
   - Update `NEXTAUTH_URL` with your actual Vercel URL
   - Redeploy if needed

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login**:
   ```bash
   vercel login
   ```

3. **Link project** (from project root):
   ```bash
   vercel link
   ```
   - Select or create a project
   - It will detect `vercel.json` configuration

4. **Set environment variables**:
   ```bash
   vercel env add DATABASE_URL
   vercel env add NEXTAUTH_SECRET
   vercel env add NEXTAUTH_URL
   ```
   (Enter values when prompted)

5. **Deploy**:
   ```bash
   vercel --prod
   ```

## Important Configuration

### Monorepo Setup

The `vercel.json` file is configured for:
- **Root Directory**: `apps/web` (Next.js app)
- **Build Command**: Includes Prisma generation
- **Install Command**: Uses pnpm

### Prisma Setup

The `package.json` includes:
- `postinstall`: Runs `prisma generate` automatically
- `vercel-build`: Runs migrations and builds

### Environment Variables Required

**Required:**
- `DATABASE_URL`: PostgreSQL connection string (from Neon)
- `NEXTAUTH_SECRET`: Random secret for NextAuth
- `NEXTAUTH_URL`: Your production URL (set after first deploy)

**Optional (for OAuth):**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`

## After Deployment

1. **Update NEXTAUTH_URL**:
   - Get your Vercel URL (e.g., `https://your-app.vercel.app`)
   - Update `NEXTAUTH_URL` in Vercel dashboard
   - Redeploy if needed

2. **Test the deployment**:
   - Visit your Vercel URL
   - Test database queries
   - Test authentication (if configured)

3. **Set up custom domain** (optional):
   - Vercel Dashboard → Settings → Domains
   - Add your custom domain

## Troubleshooting

### Build Fails: Prisma Client Not Generated
- Ensure `postinstall` script is in `package.json`
- Check that `prisma generate` runs in build logs

### Database Connection Errors
- Verify `DATABASE_URL` is set correctly
- Check that Neon database allows connections from Vercel IPs
- Ensure SSL is enabled (`?sslmode=require`)

### Monorepo Build Issues
- Verify `rootDirectory` is set to `apps/web` in Vercel settings
- Check that `pnpm-workspace.yaml` exists
- Ensure build command includes `cd apps/web` if needed

