# OAuth Setup Guide for ChatScream

This guide walks you through configuring OAuth credentials for YouTube, Facebook, and Twitch streaming.

## 🎯 Prerequisites

1. **Sign in to ChatScream** - You need an admin account (or use email/password signup)
2. **Access to Admin Portal** - Visit `/admin` after signing in
3. **OAuth credentials** - Get these from each platform's developer console

## 🔧 Quick Setup: Manual RTMP (No OAuth Required)

If you just want to stream immediately without OAuth setup:

1. Go to your platform's dashboard (YouTube Studio, Facebook Live, Twitch)
2. Find your **Stream Key** and **Server URL**
3. In ChatScream Studio → Destinations → Click "Add Custom"
4. Enter the RTMP details manually

### Default RTMP URLs:

- **YouTube**: `rtmp://a.rtmp.youtube.com/live2/`
- **Twitch**: `rtmp://live.twitch.tv/app/`
- **Facebook**: `rtmps://live-api-s.facebook.com:443/rtmp/`
- **TikTok**: `rtmp://push.tiktokv.com/live/`

---

## 📺 YouTube OAuth Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable APIs:
   - YouTube Data API v3
   - YouTube Analytics API
   - YouTube Live Streaming API

### Step 2: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `ChatScream Streaming`
5. Authorized JavaScript origins:
   ```
   https://www.chatscream.live
   https://chatscream.live
   ```
6. Authorized redirect URIs:
   ```
   https://api.chatscream.live/api/auth/oauth/google/callback
   ```
   _(This is your backend domain where OAuth responses are received before being forwarded to frontend)_

### Step 3: Configure in Admin Portal

1. Go to **Admin Portal** in ChatScream
2. Enter your **YouTube Client ID**
3. The server-side secret must be set via `.env` or hosting platform environment variables

### Environment Variables (Server-side):

```env
# Required for OAuth token exchange
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-client-secret
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
AUTH_STATE_SECRET=any-random-string-for-csrf-protection
```

---

## 📘 Facebook OAuth Setup

### Step 1: Create Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/apps/)
2. Click **Create App** → Select **Business** or **Consumer** app
3. Fill in app name (e.g., "ChatScream Streaming")

### Step 2: Enable Facebook Login

1. Add **Facebook Login** product to your app
2. Settings → Valid OAuth Redirect URIs:
   ```
   https://api.chatscream.live/api/auth/oauth/facebook/callback
   ```

### Step 3: Add Permissions

Required permissions for live streaming:

- `public_profile`
- `email`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `pages_manage_metadata`
- `publish_video`
- `live_video`

### Step 4: Configure

```env
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret
```

---

## 🎮 Twitch OAuth Setup

### Step 1: Create Twitch App

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Click **Register Your Application**
3. Name: `ChatScream Streaming`
4. OAuth Redirect URL:
   ```
   https://api.chatscream.live/api/auth/oauth/twitch/callback
   ```
5. Category: **Application Integration**
6. Required Scopes:
   - `user:read:email`
   - `channel:read:stream_key`
   - `channel:manage:broadcast`

### Step 2: Configure

```env
TWITCH_CLIENT_ID=your-client-id
TWITCH_CLIENT_SECRET=your-client-secret
```

---

## 🔐 Auth State Secret

The `AUTH_STATE_SECRET` is used for CSRF protection in OAuth flows. Any random string works:

```bash
# Generate a secure random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or manually:

```env
AUTH_STATE_SECRET=my-secure-random-string-12345
```

---

## 🚀 Testing Your Setup

### Local Development

1. Set environment variables in `.env`
2. Restart the API server: `npm run dev:api`
3. Check capabilities endpoint:
   ```bash
   curl http://localhost:8787/api/public/capabilities
   ```

### Production (Vercel + api.chatscream.live)

1. Set environment variables in Vercel (public client IDs) and backend server (secrets)
2. Verify capabilities endpoint:
   ```bash
   curl https://api.chatscream.live/api/public/capabilities
   ```
3. You should see:

   ```json
   {
     "streamKeyPlatforms": {
       "youtube": true,
       "facebook": true,
       "twitch": true
     }
   }
   ```

4. Visit `https://www.chatscream.live` and sign in

### Backend Environment Variables (api.chatscream.live)

Set these on your backend server:

```env
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-client-secret
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret
TWITCH_CLIENT_ID=your-client-id
TWITCH_CLIENT_SECRET=your-client-secret
AUTH_STATE_SECRET=your-random-secret
APP_BASE_URL=https://www.chatscream.live
```

### Frontend Environment Variables (Vercel - www.chatscream.live)

Set these in Vercel:

```env
VITE_YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_FACEBOOK_APP_ID=your-app-id
VITE_TWITCH_CLIENT_ID=your-client-id
VITE_OAUTH_REDIRECT_URI=https://www.chatscream.live/oauth/callback
VITE_API_BASE_URL=https://api.chatscream.live
```

---

## ❌ Troubleshooting

### "Connect" button does nothing

- Check browser console for errors
- Verify client IDs are set in Admin Portal
- Verify secrets are set in server environment

### OAuth popup shows error

- Check the redirect URI matches exactly in platform console
- Check server logs for specific error messages

### "Server secret missing" in UI

- The client ID is set but the server-side secret is missing
- Set the `*_SECRET` or `*_CLIENT_SECRET` environment variable on the server

### FFmpeg errors on streaming

- Ensure FFmpeg is installed on the server
- Check server logs: `npm run service:logs`

### Facebook token expires quickly

- Facebook short-lived tokens (~2 hours) are auto-extended to long-lived (~60 days)
- If refresh fails, reconnect your Facebook account

---

## 📝 Notes

- **Client IDs** can be stored in Admin Portal (public, safe to expose)
- **Client Secrets** MUST be in server environment variables (never in frontend code)
- For local dev, you can use dummy values to test the UI, but streaming will fail until real credentials are added
- The UI now shows "Setup Required" instead of hiding platforms when credentials are incomplete
