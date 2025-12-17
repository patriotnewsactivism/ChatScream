# Firebase Configuration Setup

## Quick Start

The `.env` file has been created with placeholder values. You need to replace three values with actual credentials from the Firebase Console.

## Step-by-Step Instructions

### 1. Access Firebase Console
1. Go to: https://console.firebase.google.com/project/wtp-apps/settings/general
2. Scroll down to the "Your apps" section
3. Find your Web app (look for the `</>` icon)
4. Click the "Config" button or gear icon

### 2. Copy the Firebase Configuration
You'll see a configuration object that looks like this:

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

### 3. Update Your `.env` File
Open the `.env` file and replace these three values:

```bash
VITE_FIREBASE_API_KEY=your-api-key-here          # Replace with apiKey from Firebase
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id-here  # Replace with messagingSenderId
VITE_FIREBASE_APP_ID=your-app-id-here            # Replace with appId
```

The other values (`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`) are already correctly set.

### 4. Test Your Configuration
After updating the `.env` file:

```bash
npm run dev
```

The app should now load without the Firebase configuration error.

## Alternative: Use Setup Script

You can also use the interactive setup script:

```bash
chmod +x setup-env.sh
./setup-env.sh
```

This script will prompt you for the three required values and create the `.env` file automatically.

## Security Notes

- The Firebase API key is **safe to expose** in frontend code
- It only allows Firebase SDK access, not admin access
- Actual security is enforced by Firebase Security Rules
- The `.env` file is in `.gitignore` and will **not** be committed to version control

## Need Help?

- See `QUICK_FIX.md` for more detailed troubleshooting
- Firebase Hosting docs: https://firebase.google.com/docs/hosting
- Firebase Web Setup: https://firebase.google.com/docs/web/setup
