# Setting Up chatscream.live as Main Domain

## Step 1: Get Firebase Configuration Values

1. Go to [Firebase Console](https://console.firebase.google.com/project/wtp-apps/settings/general)
2. Scroll down to "Your apps" section
3. Click on the Web app (</>)
4. Copy the configuration values:
   - API Key
   - Auth Domain
   - Project ID (should be `wtp-apps`)
   - Storage Bucket
   - Messaging Sender ID
   - App ID

5. Update `/home/user/StreamMobPro/.env` with these actual values

## Step 2: Add Custom Domain in Firebase Console

1. Go to [Firebase Hosting](https://console.firebase.google.com/project/wtp-apps/hosting/sites)
2. Click on your hosting site (should be `wtp-apps`)
3. Click "Add custom domain"
4. Enter: `chatscream.live`
5. Click "Continue"
6. Firebase will provide DNS records to add

## Step 3: Configure DNS Records

Firebase will give you one of two options:

### Option A: Using A Records (Recommended)
Add these A records to your domain registrar:
```
Type: A
Name: @
Value: <IP addresses provided by Firebase>
```

```
Type: A
Name: www
Value: <IP addresses provided by Firebase>
```

### Option B: Using CNAME Records
```
Type: CNAME
Name: @
Value: <subdomain>.web.app
```

## Step 4: Verify Domain

1. After adding DNS records, return to Firebase Console
2. Click "Verify"
3. Firebase will check DNS propagation (can take up to 24 hours)
4. Once verified, Firebase will provision SSL certificate automatically

## Step 5: Set as Primary Domain

1. In Firebase Hosting console, find the domain list
2. Find `chatscream.live`
3. Click the three dots menu
4. Select "Set as primary domain"
5. This makes chatscream.live the main domain and redirects others to it

## Step 6: Rebuild and Deploy

After updating the .env file with correct Firebase credentials:

```bash
npm run build
firebase deploy --only hosting:production --project wtp-apps
```

## Troubleshooting

### Domain not verifying?
- Check DNS propagation: https://dnschecker.org
- DNS changes can take 24-48 hours
- Make sure you added the exact records Firebase provided

### SSL certificate not provisioning?
- Firebase automatically provisions SSL after domain verification
- Can take up to 24 hours after verification
- Check Firebase Console > Hosting > domains for status

### Still seeing old domain?
- Clear browser cache
- Use incognito/private window
- Check Firebase Console that primary domain is set correctly

## Current Domains

- **Current deployed URL**: chatscream.wtpnews.org
- **Target main domain**: chatscream.live
- **Firebase project**: wtp-apps

## Quick Commands Reference

```bash
# Check current Firebase project
firebase use

# Switch to wtp-apps project
firebase use wtp-apps

# Deploy to production hosting
firebase deploy --only hosting:production --project wtp-apps

# Check hosting sites
firebase hosting:sites:list --project wtp-apps
```
