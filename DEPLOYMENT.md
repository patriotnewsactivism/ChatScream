# ChatScream Production Deployment Guide

## Prerequisites

### Required Accounts
- [x] Google Cloud Platform account with billing enabled
- [x] Firebase project (`wtp-apps`)
- [x] Stripe account (live mode)
- [x] Sentry account (optional, for error monitoring)
- [x] Domain name configured (if using custom domain)

### Required Tools
- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Git

## Pre-Deployment Checklist

### 1. Environment Variables

#### Frontend (.env)
```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=wtp-apps.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=wtp-apps
VITE_FIREBASE_STORAGE_BUCKET=wtp-apps.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id

# OAuth (Public Client IDs)
VITE_OAUTH_REDIRECT_URI=https://wtp-apps.web.app/__/auth/handler
VITE_YOUTUBE_CLIENT_ID=your-youtube-client-id
VITE_FACEBOOK_APP_ID=your-facebook-app-id
VITE_TWITCH_CLIENT_ID=your-twitch-client-id

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_STRIPE_PRO_PRICE_ID=price_...
VITE_STRIPE_EXPERT_PRICE_ID=price_...
VITE_STRIPE_ENTERPRISE_PRICE_ID=price_...

# AI
VITE_CLAUDE_API_KEY=your-claude-key
VITE_GEMINI_API_KEY=your-gemini-key

# Sentry (Optional)
VITE_SENTRY_DSN=https://...@sentry.io/...

# Environment
VITE_APP_ENV=production
VITE_DEBUG=false
```

#### Cloud Functions Secrets
Set via Firebase CLI:
```bash
firebase functions:secrets:set STRIPE_SECRET_KEY --project wtp-apps
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project wtp-apps
firebase functions:secrets:set YOUTUBE_CLIENT_ID --project wtp-apps
firebase functions:secrets:set YOUTUBE_CLIENT_SECRET --project wtp-apps
firebase functions:secrets:set FACEBOOK_APP_ID --project wtp-apps
firebase functions:secrets:set FACEBOOK_APP_SECRET --project wtp-apps
firebase functions:secrets:set TWITCH_CLIENT_ID --project wtp-apps
firebase functions:secrets:set TWITCH_CLIENT_SECRET --project wtp-apps
firebase functions:secrets:set CLAUDE_API_KEY --project wtp-apps
```

### 2. OAuth Configuration

Configure redirect URIs in OAuth provider consoles:

**YouTube/Google:**
- https://wtp-apps.firebaseapp.com/__/auth/handler
- https://wtp-apps.web.app/__/auth/handler
- https://your-custom-domain.com/__/auth/handler (if applicable)

**Facebook:**
- https://wtp-apps.firebaseapp.com/__/auth/handler
- https://wtp-apps.web.app/__/auth/handler

**Twitch:**
- https://wtp-apps.firebaseapp.com/__/auth/handler
- https://wtp-apps.web.app/__/auth/handler

### 3. Stripe Configuration

1. Switch to **Live Mode** in Stripe Dashboard
2. Create Products and Prices for each tier:
   - Pro Plan (monthly)
   - Expert Plan (monthly)
   - Enterprise Plan (monthly)
3. Configure webhook endpoint: `https://wtp-apps.web.app/api/stripe-webhook`
4. Enable events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 4. Firestore Setup

Initialize database collections:
```bash
cd infrastructure/scripts
npm install
node init-firestore.js
```

Set admin access:
```bash
ADMIN_EMAILS="mreardon@wtpnews.org" \
BETA_TESTER_EMAILS="leroytruth247@gmail.com" \
node set-access-list.js
```

### 5. Security Rules

Deploy security rules:
```bash
firebase deploy --only firestore:rules,storage:rules --project wtp-apps
```

Verify rules are deployed correctly in Firebase Console.

### 6. Build Verification

```bash
# Type check
npm run typecheck

# Run tests
npm test -- --run
npm run test:e2e

# Build
npm run build

# Build functions
cd functions
npm run build
cd ..
```

## Deployment Steps

### Option A: Full Deployment (Recommended for first deploy)

```bash
# 1. Login to Firebase
firebase login

# 2. Select project
firebase use wtp-apps

# 3. Deploy everything
firebase deploy --project wtp-apps
```

This deploys:
- Hosting (frontend)
- Cloud Functions
- Firestore rules
- Storage rules
- Firestore indexes

### Option B: Selective Deployment

```bash
# Deploy only hosting
firebase deploy --only hosting:production --project wtp-apps

# Deploy only functions
firebase deploy --only functions --project wtp-apps

# Deploy only rules
firebase deploy --only firestore:rules,storage:rules --project wtp-apps

# Deploy specific function
firebase deploy --only functions:createCheckoutSession --project wtp-apps
```

### Option C: Via GitHub Actions (CI/CD)

1. Set up repository secrets in GitHub:
   - `FIREBASE_SERVICE_ACCOUNT`: Service account JSON
   - `FIREBASE_TOKEN`: Firebase CI token
   - `VITE_FIREBASE_*`: All Firebase config vars
   - `SNYK_TOKEN`: (optional) Snyk security scanning

2. Push to main branch:
```bash
git add .
git commit -m "Deploy: Production release"
git push origin main
```

The CI/CD pipeline will automatically:
- Run tests
- Build application
- Deploy to production
- Run security scans

## Post-Deployment

### 1. Verify Deployment

- Visit https://wtp-apps.web.app
- Test authentication flows
- Verify OAuth connections
- Test payment flow with Stripe test card
- Check Cloud Functions logs

### 2. Monitor

```bash
# View hosting logs
firebase hosting:channel:list --project wtp-apps

# View function logs
firebase functions:log --project wtp-apps

# View function errors
firebase functions:log --only error --project wtp-apps
```

### 3. Set Up Monitoring

- Enable Firebase Performance Monitoring
- Configure Sentry alerts
- Set up uptime monitoring (UptimeRobot, Pingdom, etc.)
- Configure GCP alerting for function errors

### 4. Database Backups

Enable automated Firestore backups:
```bash
gcloud firestore backups schedules create \
  --database=(default) \
  --recurrence=daily \
  --retention=7d \
  --project=wtp-apps
```

## Custom Domain Setup (Optional)

1. Add custom domain in Firebase Console:
   - Hosting > Add custom domain
   - Follow DNS verification steps

2. Update environment variables:
   ```bash
   VITE_OAUTH_REDIRECT_URI=https://your-domain.com/__/auth/handler
   ```

3. Update OAuth provider redirect URIs

4. Redeploy:
   ```bash
   firebase deploy --only hosting --project wtp-apps
   ```

## Rollback Procedure

### Hosting Rollback
```bash
# List recent deployments
firebase hosting:channel:list --project wtp-apps

# Rollback to previous version
firebase hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL_ID DEST_SITE_ID:live
```

### Functions Rollback
Functions don't have built-in rollback. Deploy previous version:
```bash
git checkout <previous-commit>
cd functions
npm run build
firebase deploy --only functions --project wtp-apps
```

## Troubleshooting

### Build Failures
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Function Deployment Errors
- Verify all secrets are set: `firebase functions:secrets:access --project wtp-apps`
- Check Node.js version matches functions/package.json engines
- Review function logs for runtime errors

### OAuth Issues
- Verify redirect URIs match exactly (including trailing slashes)
- Check OAuth app is in production mode (not development/testing)
- Verify client IDs and secrets are correct

### Payment Issues
- Confirm Stripe is in live mode
- Verify webhook endpoint is correct
- Check webhook secret matches deployment
- Review Stripe dashboard for failed payments

## Monitoring & Alerts

### Firebase Console
- Performance tab
- Crashlytics (if mobile)
- Analytics

### Cloud Console
- Cloud Functions metrics
- Error Reporting
- Logging

### Sentry (if configured)
- Error tracking
- Performance monitoring
- Release tracking

## Cost Optimization

- Review Cloud Functions usage monthly
- Monitor Firestore read/write operations
- Optimize media storage (compression, CDN)
- Consider Cloud Storage lifecycle policies for old recordings

## Security Checklist

- [x] All API keys rotated from development
- [x] Firestore security rules deployed
- [x] Storage security rules deployed
- [x] CORS configured correctly
- [x] Rate limiting enabled on Cloud Functions
- [x] Stripe webhook signatures verified
- [x] OAuth secrets secured in Secret Manager
- [x] Admin access properly restricted
- [x] HTTPS enforced (automatic with Firebase Hosting)

## Support & Maintenance

### Regular Tasks
- Weekly: Review error logs
- Monthly: Security updates (`npm audit`)
- Quarterly: Dependency updates
- Annually: Review and rotate API keys

### Emergency Contacts
- Firebase Support: https://firebase.google.com/support
- Stripe Support: https://support.stripe.com
- GCP Support: https://cloud.google.com/support

---

**Last Updated:** 2025-12-16
**Version:** 1.1.0
