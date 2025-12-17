# Production Deployment Checklist

## Pre-Deployment Checklist

### ✅ Completed (Automated)
- [x] TypeScript compilation errors fixed
- [x] Firebase Storage rules configured
- [x] Unit tests passing
- [x] CI/CD pipeline configured (GitHub Actions)
- [x] Deployment documentation created
- [x] Production environment templates created
- [x] Deployment scripts created

### 🔧 Requires Manual Setup

#### 1. Firebase Project Setup
- [ ] Verify Firebase project `wtp-apps` exists
- [ ] Ensure billing is enabled
- [ ] Enable required Firebase services:
  - [ ] Authentication (Email/Password, Google, Facebook, GitHub, Twitter, Apple)
  - [ ] Firestore
  - [ ] Storage
  - [ ] Functions
  - [ ] Hosting

#### 2. Environment Variables
- [ ] Copy `.env.production.example` to `.env.production`
- [ ] Fill in all Firebase configuration values
- [ ] Add all OAuth client IDs
- [ ] Add Stripe publishable key and price IDs
- [ ] Add AI API keys (Claude, Gemini)
- [ ] Add Sentry DSN (optional)

#### 3. Cloud Functions Secrets
Run: `./scripts/setup-production-env.sh`

Or manually set:
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `YOUTUBE_CLIENT_ID`
- [ ] `YOUTUBE_CLIENT_SECRET`
- [ ] `FACEBOOK_APP_ID`
- [ ] `FACEBOOK_APP_SECRET`
- [ ] `TWITCH_CLIENT_ID`
- [ ] `TWITCH_CLIENT_SECRET`
- [ ] `CLAUDE_API_KEY`

#### 4. OAuth Provider Configuration
**YouTube/Google Cloud Console:**
- [ ] Create OAuth 2.0 Client ID
- [ ] Add authorized redirect URIs:
  - `https://wtp-apps.firebaseapp.com/__/auth/handler`
  - `https://wtp-apps.web.app/__/auth/handler`
- [ ] Enable YouTube Data API v3

**Facebook Developers:**
- [ ] Create Facebook App
- [ ] Add Facebook Login product
- [ ] Configure Valid OAuth Redirect URIs:
  - `https://wtp-apps.firebaseapp.com/__/auth/handler`
  - `https://wtp-apps.web.app/__/auth/handler`
- [ ] Switch app to Live mode

**Twitch Developers:**
- [ ] Create Twitch Application
- [ ] Add OAuth Redirect URLs:
  - `https://wtp-apps.firebaseapp.com/__/auth/handler`
  - `https://wtp-apps.web.app/__/auth/handler`

#### 5. Stripe Configuration
- [ ] Switch Stripe to Live mode
- [ ] Create Products for each tier:
  - [ ] Pro Plan (monthly subscription)
  - [ ] Expert Plan (monthly subscription)
  - [ ] Enterprise Plan (monthly subscription)
- [ ] Copy Price IDs to `.env.production`
- [ ] Create webhook endpoint:
  - URL: `https://wtp-apps.web.app/api/stripe-webhook`
  - Events: `payment_intent.*`, `customer.subscription.*`
- [ ] Copy webhook signing secret to secrets

#### 6. Database Initialization
```bash
cd infrastructure/scripts
npm install

# Initialize collections
node init-firestore.js

# Set up admin access
ADMIN_EMAILS="mreardon@wtpnews.org" \
BETA_TESTER_EMAILS="leroytruth247@gmail.com" \
node set-access-list.js
```

#### 7. Firestore Indexes
- [ ] Deploy indexes: `firebase deploy --only firestore:indexes --project wtp-apps`
- [ ] Verify indexes are built in Firebase Console

#### 8. Security Rules
- [ ] Review `firestore.rules`
- [ ] Review `storage.rules`
- [ ] Deploy: `firebase deploy --only firestore:rules,storage:rules --project wtp-apps`

#### 9. Media Server Infrastructure (Optional)
If using RTMP/HLS streaming:
- [ ] Run `./infrastructure/create-vm.sh`
- [ ] Configure firewall rules
- [ ] Update `.env.production` with VM IP
- [ ] Test RTMP connectivity

#### 10. Monitoring Setup

**Sentry (Error Monitoring):**
- [ ] Create Sentry project
- [ ] Add DSN to `.env.production`
- [ ] Test error reporting

**Firebase Performance:**
- [ ] Enable Performance Monitoring in Firebase Console
- [ ] Add Performance SDK initialization (if needed)

**Cloud Monitoring:**
- [ ] Set up log-based metrics
- [ ] Configure alerting policies:
  - [ ] Function errors > 10/min
  - [ ] High latency (p99 > 5s)
  - [ ] Failed Stripe webhooks
- [ ] Create uptime checks

**Cost Alerts:**
- [ ] Set up billing alerts in GCP
- [ ] Monitor daily spending

#### 11. Backups & Disaster Recovery
```bash
# Enable automated Firestore backups
gcloud firestore backups schedules create \
  --database=(default) \
  --recurrence=daily \
  --retention=7d \
  --project=wtp-apps
```

#### 12. CI/CD Configuration (GitHub)
**Required Secrets:**
- [ ] `FIREBASE_SERVICE_ACCOUNT` - Service account JSON
- [ ] `FIREBASE_TOKEN` - Firebase CI token (`firebase login:ci`)
- [ ] `VITE_FIREBASE_*` - All Firebase config variables
- [ ] `SNYK_TOKEN` - (optional) Security scanning

#### 13. Custom Domain (Optional)
- [ ] Add custom domain in Firebase Console
- [ ] Verify DNS records
- [ ] Wait for SSL provisioning
- [ ] Update OAuth redirect URIs
- [ ] Update `.env.production` with custom domain
- [ ] Redeploy

## Deployment

### First Time Deployment
```bash
# 1. Set up environment
./scripts/setup-production-env.sh

# 2. Edit .env.production with all values

# 3. Deploy
./scripts/deploy-production.sh
```

### Subsequent Deployments
```bash
./scripts/deploy-production.sh
```

Or use GitHub Actions:
```bash
git push origin main
```

## Post-Deployment Verification

### Smoke Tests
- [ ] Visit https://wtp-apps.web.app
- [ ] Sign up with email/password
- [ ] Log in with Google OAuth
- [ ] Connect YouTube account
- [ ] Connect Facebook page
- [ ] Upload media asset to MediaBin
- [ ] Start mock stream
- [ ] Test payment flow (use Stripe test card in dev)
- [ ] Verify cloud function logs (no errors)
- [ ] Check Sentry for errors

### Production Tests
- [ ] Real payment with real card (small amount)
- [ ] Verify Stripe webhook receives events
- [ ] Test subscription upgrade/downgrade
- [ ] Test OAuth token refresh
- [ ] Monitor function cold start times
- [ ] Check bandwidth usage
- [ ] Verify Firestore reads/writes are within budget

## Monitoring Schedule

### Daily
- [ ] Check Sentry for new errors
- [ ] Review Cloud Functions error logs
- [ ] Monitor Stripe successful/failed payments

### Weekly
- [ ] Review performance metrics
- [ ] Check storage usage
- [ ] Review cost trends
- [ ] Security scan (`npm audit`)

### Monthly
- [ ] Update dependencies
- [ ] Review Firebase quotas
- [ ] Backup verification
- [ ] Load testing

### Quarterly
- [ ] Security audit
- [ ] Rotate API keys
- [ ] Review access controls
- [ ] Disaster recovery drill

## Rollback Procedure

### Hosting
```bash
# View deployments
firebase hosting:channel:list --project wtp-apps

# Clone previous version to live
firebase hosting:clone wtp-apps:CHANNEL_ID wtp-apps:live
```

### Functions
```bash
git checkout <previous-commit>
cd functions && npm run build
firebase deploy --only functions --project wtp-apps
```

## Emergency Contacts

- **Firebase Support:** https://firebase.google.com/support
- **Stripe Support:** https://support.stripe.com
- **Google Cloud Support:** https://cloud.google.com/support
- **On-call Developer:** [Add phone/email]

## Known Issues

- None currently documented

## Recent Changes

### 2025-12-16
- Initial production deployment setup
- CI/CD pipeline configured
- All security rules deployed
- Storage rules implemented

---

**Last Updated:** 2025-12-16 23:35 UTC
**Version:** 1.1.0
**Deployed By:** Automated Setup
