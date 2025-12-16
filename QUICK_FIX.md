# Quick Fix for Firebase Error & Adding chatscream.live

## Problem
The site at `chatscream.wtpnews.org` shows: "Missing Firebase config: VITE_FIREBASE_API_KEY..."

## Root Cause
The deployed build is missing the `.env` file with actual Firebase credentials.

## Solution: 2 Steps

### Step 1: Fix Firebase Configuration (Required - 5 minutes)

#### Option A: Interactive Script
```bash
./setup-env.sh
```
Follow the prompts to enter your Firebase credentials.

#### Option B: Manual Edit
1. Open `.env` file
2. Go to https://console.firebase.google.com/project/wtp-apps/settings/general
3. Click the Web app icon (</>)
4. Copy these values into `.env`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

#### Deploy the Fix
```bash
npm run build
firebase deploy --only hosting:production --project wtp-apps
```

**This will fix the error immediately!**

---

### Step 2: Add chatscream.live as Main Domain (Optional - 24-48 hours for DNS)

#### 2.1: Add Domain in Firebase Console
1. Go to https://console.firebase.google.com/project/wtp-apps/hosting/sites
2. Click your site (wtp-apps)
3. Click "Add custom domain"
4. Enter: `chatscream.live`
5. Click "Continue"

#### 2.2: Configure DNS
Firebase will provide DNS records. Add them to your domain registrar:

**A Records (Recommended):**
```
Type: A
Name: @
Value: [IPs provided by Firebase]

Type: A
Name: www
Value: [IPs provided by Firebase]
```

#### 2.3: Wait for Verification
- DNS propagation: 24-48 hours
- Check status: https://dnschecker.org
- Firebase will auto-provision SSL certificate

#### 2.4: Set as Primary Domain
1. In Firebase Console, find domain list
2. Click three dots next to `chatscream.live`
3. Select "Set as primary domain"

---

## Files Created

- `.env` - Environment variables (YOU MUST UPDATE THIS)
- `setup-env.sh` - Interactive setup script
- `DOMAIN_SETUP.md` - Detailed domain setup guide
- `QUICK_FIX.md` - This file

## Immediate Action Required

**To fix the current error:**
1. Update `.env` with real Firebase credentials
2. Run `npm run build`
3. Run `firebase deploy --only hosting:production --project wtp-apps`

**To add chatscream.live:**
Follow Step 2 above (can be done anytime)

---

## Getting Firebase Credentials

### Where to Find Them:
1. Go to: https://console.firebase.google.com/project/wtp-apps/settings/general
2. Scroll to "Your apps"
3. Find the Web app
4. Click the config icon (looks like </>) or "Config"
5. Copy the values from the `firebaseConfig` object

### What They Look Like:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "wtp-apps.firebaseapp.com",
  projectId: "wtp-apps",
  storageBucket: "wtp-apps.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

### Security Note:
- The API Key is safe to expose in frontend code
- It only allows Firebase SDK access, not admin access
- Actual security is handled by Firebase Security Rules

---

## Troubleshooting

### Error persists after deploy?
- Clear browser cache
- Check .env file has correct values (no quotes needed)
- Rebuild: `npm run build`
- Redeploy: `firebase deploy --only hosting:production --project wtp-apps`

### Domain not working?
- See detailed guide in `DOMAIN_SETUP.md`
- DNS changes take 24-48 hours
- Use https://dnschecker.org to monitor propagation

### Need help?
- Firebase Hosting docs: https://firebase.google.com/docs/hosting
- Custom domain guide: https://firebase.google.com/docs/hosting/custom-domain
