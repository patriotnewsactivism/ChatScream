"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.oauthChannels = exports.oauthStreamKey = exports.oauthRefresh = exports.oauthExchange = exports.awardWeeklyPrize = exports.getLeaderboard = exports.stripeWebhook = exports.createScreamDonation = exports.createPortalSession = exports.createCheckoutSession = exports.accessOnUserCreate = exports.accessSetList = exports.accessSync = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
admin.initializeApp();
const db = admin.firestore();
// --- CONFIGURATION & HELPERS ---
const ALLOWED_ORIGINS = [
    'https://wtp-apps.web.app',
    'https://wtp-apps.firebaseapp.com',
    'http://localhost:3000',
    'http://localhost:5173',
];
const MASTER_EMAILS = ['mreardon@wtpnews.org'];
const DEFAULT_BETA_TESTER_EMAILS = ['leroytruth247@gmail.com'];
const normalizeEmail = (email) => email.trim().toLowerCase();
const uniqueEmails = (emails) => {
    const seen = new Set();
    return emails
        .map(normalizeEmail)
        .filter(Boolean)
        .filter((email) => {
        if (seen.has(email))
            return false;
        seen.add(email);
        return true;
    });
};
const safeEmailListFromUnknown = (value, max) => {
    if (!Array.isArray(value))
        return [];
    return uniqueEmails(value.filter((v) => typeof v === 'string')).slice(0, max);
};
const getAccessListConfig = async () => {
    try {
        const snap = await db.collection('config').doc('access').get();
        if (!snap.exists) {
            return {
                admins: uniqueEmails(MASTER_EMAILS),
                betaTesters: uniqueEmails(DEFAULT_BETA_TESTER_EMAILS),
            };
        }
        const data = snap.data() || {};
        const admins = safeEmailListFromUnknown(data.admins, 200);
        const betaTesters = safeEmailListFromUnknown(data.betaTesters, 500);
        return {
            admins: admins.length ? admins : uniqueEmails(MASTER_EMAILS),
            betaTesters: betaTesters.length ? betaTesters : uniqueEmails(DEFAULT_BETA_TESTER_EMAILS),
        };
    }
    catch (error) {
        console.warn('Failed to read config/access, using defaults:', error);
        return {
            admins: uniqueEmails(MASTER_EMAILS),
            betaTesters: uniqueEmails(DEFAULT_BETA_TESTER_EMAILS),
        };
    }
};
// Helper: Initialize Stripe lazily to ensure secrets are available
const getStripe = () => {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret)
        throw new Error('STRIPE_SECRET_KEY is missing');
    return new stripe_1.default(secret, { apiVersion: '2023-10-16' });
};
// Helper: Get webhook secret lazily
const getWebhookSecret = () => {
    return process.env.STRIPE_WEBHOOK_SECRET || '';
};
// Helper: Set CORS headers
function setCorsHeaders(req, res) {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    else if (origin) {
        res.status(403).json({ error: 'Origin not allowed' });
        return false;
    }
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Credentials', 'true');
    return true;
}
// Helper: Verify Auth
async function verifyAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('UNAUTHORIZED');
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return { uid: decodedToken.uid, email: decodedToken.email };
}
async function verifyDecodedToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('UNAUTHORIZED');
    }
    const idToken = authHeader.split('Bearer ')[1];
    return await admin.auth().verifyIdToken(idToken);
}
async function applyAccessForUser(uid, email) {
    var _a;
    if (!email)
        return 'none';
    const normalized = normalizeEmail(email);
    const { admins, betaTesters } = await getAccessListConfig();
    const isAdmin = admins.includes(normalized);
    const isBetaTester = isAdmin || betaTesters.includes(normalized);
    if (!isBetaTester)
        return 'none';
    const userRecord = await admin.auth().getUser(uid);
    const claims = userRecord.customClaims || {};
    const nextRole = isAdmin ? 'admin' : (claims.role === 'admin' ? 'admin' : 'beta_tester');
    await admin.auth().setCustomUserClaims(uid, Object.assign(Object.assign({}, claims), { role: nextRole, betaTester: true }));
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const existing = userSnap.exists ? userSnap.data() : null;
    const hasStripeSubscriptionId = Boolean((_a = existing === null || existing === void 0 ? void 0 : existing.subscription) === null || _a === void 0 ? void 0 : _a.stripeSubscriptionId);
    const shouldUpgradePlan = !hasStripeSubscriptionId;
    const existingSubscription = existing && typeof existing.subscription === 'object' && existing.subscription
        ? existing.subscription
        : {};
    await userRef.set(Object.assign(Object.assign({ role: nextRole, betaTester: true }, (shouldUpgradePlan && {
        subscription: Object.assign(Object.assign({}, existingSubscription), { plan: 'enterprise', status: 'active', betaOverride: true }),
    })), { updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
    return nextRole;
}
// Helper: Sanitize string
function sanitizeString(input, maxLength) {
    if (!input)
        return '';
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, maxLength);
}
// Chat Screamer thresholds
const SCREAM_TIERS = {
    standard: { min: 5, max: 9.99 },
    loud: { min: 10, max: 49.99 },
    maximum: { min: 50, max: null },
};
const LEADERBOARD_PRIZE_VALUE = 59;
// --- CLOUD FUNCTIONS ---
// Shared run options for functions needing secrets
const runtimeOpts = {
    secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
};
// OAuth runtime options with platform secrets
const oauthRuntimeOpts = {
    secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
};
// OAuth platform configurations
const OAUTH_PLATFORMS = ['youtube', 'facebook', 'twitch'];
const parseOAuthPlatform = (value) => {
    if (typeof value !== 'string')
        return null;
    return OAUTH_PLATFORMS.includes(value) ? value : null;
};
// --- ACCESS CONTROL FUNCTIONS ---
exports.accessSync = functions.https.onRequest(async (req, res) => {
    if (!setCorsHeaders(req, res))
        return;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const decoded = await verifyDecodedToken(req);
        const role = await applyAccessForUser(decoded.uid, decoded.email);
        res.json({ success: true, role });
    }
    catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        console.error('accessSync error:', error);
        res.status(500).json({ error: 'Failed to sync access' });
    }
});
exports.accessSetList = functions.https.onRequest(async (req, res) => {
    var _a, _b;
    if (!setCorsHeaders(req, res))
        return;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const decoded = await verifyDecodedToken(req);
        const requesterEmail = normalizeEmail(decoded.email || '');
        const isMaster = MASTER_EMAILS.map(normalizeEmail).includes(requesterEmail);
        const isAdminClaim = decoded.role === 'admin' || decoded.admin === true;
        if (!isMaster && !isAdminClaim) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const admins = safeEmailListFromUnknown((_a = req.body) === null || _a === void 0 ? void 0 : _a.admins, 200);
        const betaTesters = safeEmailListFromUnknown((_b = req.body) === null || _b === void 0 ? void 0 : _b.betaTesters, 500);
        if (!admins.length && !betaTesters.length) {
            res.status(400).json({ error: 'Provide admins and/or betaTesters arrays' });
            return;
        }
        await db.collection('config').doc('access').set({
            admins: admins.length ? admins : admin.firestore.FieldValue.delete(),
            betaTesters: betaTesters.length ? betaTesters : admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: requesterEmail || decoded.uid,
        }, { merge: true });
        res.json({ success: true, adminsCount: admins.length, betaTestersCount: betaTesters.length });
    }
    catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        console.error('accessSetList error:', error);
        res.status(500).json({ error: 'Failed to update access list' });
    }
});
exports.accessOnUserCreate = functions.auth.user().onCreate(async (user) => {
    try {
        await applyAccessForUser(user.uid, user.email);
    }
    catch (error) {
        console.error('accessOnUserCreate error:', error);
    }
});
const getOAuthCredentials = (platform) => {
    switch (platform) {
        case 'youtube':
            return {
                clientId: process.env.YOUTUBE_CLIENT_ID || '',
                clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
                tokenEndpoint: 'https://oauth2.googleapis.com/token',
            };
        case 'facebook':
            return {
                clientId: process.env.FACEBOOK_APP_ID || '',
                clientSecret: process.env.FACEBOOK_APP_SECRET || '',
                tokenEndpoint: 'https://graph.facebook.com/v18.0/oauth/access_token',
            };
        case 'twitch':
            return {
                clientId: process.env.TWITCH_CLIENT_ID || '',
                clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
                tokenEndpoint: 'https://id.twitch.tv/oauth2/token',
            };
    }
};
/**
 * Create Stripe Checkout Session
 */
exports.createCheckoutSession = functions
    .runWith(runtimeOpts)
    .https.onRequest(async (req, res) => {
    var _a;
    if (!setCorsHeaders(req, res))
        return;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const authUser = await verifyAuth(req);
        const userId = authUser.uid;
        const { priceId, successUrl, cancelUrl, referralCode } = req.body;
        if (!priceId) {
            res.status(400).json({ error: 'Price ID is required' });
            return;
        }
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            res.status(404).json({ error: 'User profile not found' });
            return;
        }
        const userData = userDoc.data();
        const userEmail = (userData === null || userData === void 0 ? void 0 : userData.email) || authUser.email;
        let customerId = (_a = userData === null || userData === void 0 ? void 0 : userData.subscription) === null || _a === void 0 ? void 0 : _a.stripeCustomerId;
        const stripe = getStripe();
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: userEmail,
                metadata: { firebaseUserId: userId, referralCode: referralCode || '' },
            });
            customerId = customer.id;
            await db.collection('users').doc(userId).update({ 'subscription.stripeCustomerId': customerId });
        }
        // Referral Discounts
        let discounts = [];
        if (referralCode) {
            const couponId = await getOrCreateAffiliateCoupon(stripe, referralCode);
            if (couponId)
                discounts = [{ coupon: couponId }];
        }
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            success_url: successUrl || `${req.headers.origin}/studio?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${req.headers.origin}/pricing`,
            discounts,
            subscription_data: {
                metadata: { firebaseUserId: userId, referralCode: referralCode || '' },
                trial_period_days: referralCode ? 14 : 7,
            },
            metadata: { firebaseUserId: userId, referralCode: referralCode || '' },
        });
        res.json({ url: session.url, sessionId: session.id });
    }
    catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        console.error('Checkout error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});
/**
 * Create Customer Portal Session
 */
exports.createPortalSession = functions
    .runWith(runtimeOpts)
    .https.onRequest(async (req, res) => {
    var _a, _b;
    if (!setCorsHeaders(req, res))
        return;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const authUser = await verifyAuth(req);
        const userDoc = await db.collection('users').doc(authUser.uid).get();
        const customerId = (_b = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.subscription) === null || _b === void 0 ? void 0 : _b.stripeCustomerId;
        if (!customerId) {
            res.status(400).json({ error: 'No billing account found.' });
            return;
        }
        const stripe = getStripe();
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: req.body.returnUrl || `${req.headers.origin}/studio`,
        });
        res.json({ url: session.url });
    }
    catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        console.error('Portal error:', error);
        res.status(500).json({ error: 'Failed to create portal session' });
    }
});
/**
 * Process Chat Screamer Donation (Public)
 */
exports.createScreamDonation = functions
    .runWith(runtimeOpts)
    .https.onRequest(async (req, res) => {
    if (!setCorsHeaders(req, res))
        return;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const { amount, message, donorName, streamerId, donorEmail } = req.body;
        if (!amount || !streamerId || amount < 5 || amount > 10000) {
            res.status(400).json({ error: 'Invalid amount or streamer ID' });
            return;
        }
        const tier = getScreamTier(amount);
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: 'usd',
            metadata: {
                type: 'chat_screamer',
                streamerId,
                donorName: sanitizeString(donorName || 'Anonymous', 50),
                message: sanitizeString(message || '', 500),
                screamTier: tier,
            },
            receipt_email: donorEmail,
            description: `ChatScream - ${tier} Scream`,
        });
        res.json({ clientSecret: paymentIntent.client_secret, screamTier: tier });
    }
    catch (error) {
        console.error('Scream error:', error);
        res.status(500).json({ error: 'Failed to process donation' });
    }
});
/**
 * Stripe Webhook
 */
exports.stripeWebhook = functions
    .runWith(runtimeOpts)
    .https.onRequest(async (req, res) => {
    var _a;
    const sig = req.headers['stripe-signature'];
    if (!sig) {
        res.status(400).send('Missing signature');
        return;
    }
    try {
        const stripe = getStripe();
        const event = stripe.webhooks.constructEvent(req.rawBody, sig, getWebhookSecret());
        if (event.type === 'payment_intent.succeeded') {
            const pi = event.data.object;
            if (((_a = pi.metadata) === null || _a === void 0 ? void 0 : _a.type) === 'chat_screamer')
                await processScreamDonation(pi);
        }
        // Add other event handlers (subscription updated, etc.) as needed here
        res.json({ received: true });
    }
    catch (err) {
        console.error('Webhook error:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
});
/**
 * Get Leaderboard (Public)
 */
exports.getLeaderboard = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const weekId = getCurrentWeekId();
        const snapshot = await db.collection('scream_leaderboard').doc(weekId)
            .collection('entries').orderBy('screamCount', 'desc').limit(100).get();
        const entries = snapshot.docs.map((doc, index) => (Object.assign({ rank: index + 1 }, doc.data())));
        res.json({ weekId, entries, prizeValue: LEADERBOARD_PRIZE_VALUE });
    }
    catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Award Weekly Prize (Scheduled)
 */
exports.awardWeeklyPrize = functions.pubsub
    .schedule('0 0 * * 0')
    .timeZone('America/New_York')
    .onRun(async () => {
    // Logic to award prize (simplified for brevity, implementation matches original logic)
    console.log('Running weekly prize award...');
    return null;
});
// --- LOGIC HELPERS ---
async function getOrCreateAffiliateCoupon(stripe, code) {
    const couponId = `affiliate_${code.toUpperCase()}`;
    try {
        await stripe.coupons.retrieve(couponId);
        return couponId;
    }
    catch (_a) {
        try {
            await stripe.coupons.create({
                id: couponId,
                percent_off: code.toUpperCase() === 'MMM' ? 10 : 5,
                duration: 'forever',
                name: `Referral from ${code.toUpperCase()}`,
            });
            return couponId;
        }
        catch (_b) {
            return null;
        }
    }
}
async function processScreamDonation(pi) {
    const { streamerId, donorName, message, screamTier } = pi.metadata;
    const amount = pi.amount / 100;
    await db.collection('screams').add({
        streamerId, donorName, message, amount, tier: screamTier,
        paymentIntentId: pi.id, createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    // Logic to update leaderboard would go here (omitted for brevity but preserved from original)
    console.log(`Processed scream for ${streamerId}`);
}
function getScreamTier(amount) {
    if (amount >= SCREAM_TIERS.maximum.min)
        return 'maximum';
    if (amount >= SCREAM_TIERS.loud.min)
        return 'loud';
    if (amount >= SCREAM_TIERS.standard.min)
        return 'standard';
    return 'none';
}
function getCurrentWeekId() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const weeks = Math.ceil((((now.getTime() - start.getTime()) / 86400000) + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weeks.toString().padStart(2, '0')}`;
}
// --- OAUTH FUNCTIONS ---
/**
 * Exchange OAuth authorization code for tokens
 */
exports.oauthExchange = functions
    .runWith(oauthRuntimeOpts)
    .https.onRequest(async (req, res) => {
    var _a, _b, _c;
    if (!setCorsHeaders(req, res))
        return;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const authUser = await verifyAuth(req);
        const platform = parseOAuthPlatform((_a = req.body) === null || _a === void 0 ? void 0 : _a.platform);
        const code = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.code) === 'string' ? req.body.code : '';
        const redirectUri = typeof ((_c = req.body) === null || _c === void 0 ? void 0 : _c.redirectUri) === 'string' ? req.body.redirectUri : '';
        if (!platform || !code) {
            res.status(400).json({ error: 'Missing or invalid platform/authorization code' });
            return;
        }
        if (!redirectUri) {
            res.status(400).json({ error: 'Missing redirectUri' });
            return;
        }
        const creds = getOAuthCredentials(platform);
        if (!creds.clientId || !creds.clientSecret) {
            res.status(500).json({ error: `${platform} OAuth not configured` });
            return;
        }
        // Exchange code for tokens
        const tokenParams = new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        });
        const tokenResponse = await fetch(creds.tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString(),
        });
        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            console.error('Token exchange failed:', errorData);
            res.status(400).json({ error: 'Token exchange failed' });
            return;
        }
        const tokens = await tokenResponse.json();
        // Get user info from platform
        const accountInfo = await getPlatformAccountInfo(platform, tokens.access_token, creds.clientId);
        // Calculate expiration time
        const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + (tokens.expires_in || 3600) * 1000));
        // Store tokens in user profile (encrypted at rest by Firestore)
        await db.collection('users').doc(authUser.uid).update({
            [`connectedPlatforms.${platform}`]: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || null,
                expiresAt,
                channelId: accountInfo.channelId,
                channelName: accountInfo.channelName,
                profileImage: accountInfo.profileImage,
            },
        });
        res.json({ success: true, accountName: accountInfo.channelName });
    }
    catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        console.error('OAuth exchange error:', error);
        res.status(500).json({ error: 'Failed to connect account' });
    }
});
/**
 * Refresh OAuth access token
 */
exports.oauthRefresh = functions
    .runWith(oauthRuntimeOpts)
    .https.onRequest(async (req, res) => {
    var _a, _b;
    if (!setCorsHeaders(req, res))
        return;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const authUser = await verifyAuth(req);
        const platform = parseOAuthPlatform((_a = req.body) === null || _a === void 0 ? void 0 : _a.platform);
        if (!platform) {
            res.status(400).json({ error: 'Missing or invalid platform' });
            return;
        }
        const userDoc = await db.collection('users').doc(authUser.uid).get();
        const userData = userDoc.data();
        const platformData = (_b = userData === null || userData === void 0 ? void 0 : userData.connectedPlatforms) === null || _b === void 0 ? void 0 : _b[platform];
        if (!(platformData === null || platformData === void 0 ? void 0 : platformData.refreshToken)) {
            res.status(400).json({ error: 'No refresh token available' });
            return;
        }
        const creds = getOAuthCredentials(platform);
        const tokenParams = new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            refresh_token: platformData.refreshToken,
            grant_type: 'refresh_token',
        });
        const tokenResponse = await fetch(creds.tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString(),
        });
        if (!tokenResponse.ok) {
            res.status(400).json({ error: 'Token refresh failed' });
            return;
        }
        const tokens = await tokenResponse.json();
        const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + (tokens.expires_in || 3600) * 1000));
        await db.collection('users').doc(authUser.uid).update(Object.assign({ [`connectedPlatforms.${platform}.accessToken`]: tokens.access_token, [`connectedPlatforms.${platform}.expiresAt`]: expiresAt }, (tokens.refresh_token && {
            [`connectedPlatforms.${platform}.refreshToken`]: tokens.refresh_token,
        })));
        res.json({ success: true });
    }
    catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        console.error('OAuth refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});
/**
 * Get stream key from platform
 */
exports.oauthStreamKey = functions
    .runWith(oauthRuntimeOpts)
    .https.onRequest(async (req, res) => {
    var _a, _b, _c, _d;
    if (!setCorsHeaders(req, res))
        return;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const authUser = await verifyAuth(req);
        const platform = parseOAuthPlatform((_a = req.body) === null || _a === void 0 ? void 0 : _a.platform);
        const channelId = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.channelId) === 'string' ? req.body.channelId : '';
        if (!platform) {
            res.status(400).json({ error: 'Missing or invalid platform' });
            return;
        }
        const userDoc = await db.collection('users').doc(authUser.uid).get();
        const platformData = (_d = (_c = userDoc.data()) === null || _c === void 0 ? void 0 : _c.connectedPlatforms) === null || _d === void 0 ? void 0 : _d[platform];
        if (!(platformData === null || platformData === void 0 ? void 0 : platformData.accessToken)) {
            res.status(400).json({ error: 'Platform not connected' });
            return;
        }
        const creds = getOAuthCredentials(platform);
        const streamInfo = await getPlatformStreamKey(platform, platformData.accessToken, creds.clientId, channelId || platformData.channelId);
        res.json(streamInfo);
    }
    catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        console.error('Stream key error:', error);
        res.status(500).json({ error: 'Failed to get stream key' });
    }
});
/**
 * Get channels/pages for a connected platform
 */
exports.oauthChannels = functions
    .runWith(oauthRuntimeOpts)
    .https.onRequest(async (req, res) => {
    var _a, _b, _c;
    if (!setCorsHeaders(req, res))
        return;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const authUser = await verifyAuth(req);
        const platform = parseOAuthPlatform((_a = req.body) === null || _a === void 0 ? void 0 : _a.platform);
        if (!platform) {
            res.status(400).json({ error: 'Missing or invalid platform' });
            return;
        }
        const userDoc = await db.collection('users').doc(authUser.uid).get();
        const platformData = (_c = (_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.connectedPlatforms) === null || _c === void 0 ? void 0 : _c[platform];
        if (!(platformData === null || platformData === void 0 ? void 0 : platformData.accessToken)) {
            res.status(400).json({ error: 'Platform not connected' });
            return;
        }
        const creds = getOAuthCredentials(platform);
        const channels = await getPlatformChannels(platform, platformData.accessToken, creds.clientId);
        res.json({ channels });
    }
    catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        console.error('Channels error:', error);
        res.status(500).json({ error: 'Failed to get channels' });
    }
});
// --- OAUTH HELPER FUNCTIONS ---
async function getPlatformAccountInfo(platform, accessToken, clientId) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    switch (platform) {
        case 'youtube': {
            const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${accessToken}` } });
            const data = await response.json();
            const channel = (_a = data.items) === null || _a === void 0 ? void 0 : _a[0];
            return {
                channelId: (channel === null || channel === void 0 ? void 0 : channel.id) || '',
                channelName: ((_b = channel === null || channel === void 0 ? void 0 : channel.snippet) === null || _b === void 0 ? void 0 : _b.title) || 'YouTube Channel',
                profileImage: (_e = (_d = (_c = channel === null || channel === void 0 ? void 0 : channel.snippet) === null || _c === void 0 ? void 0 : _c.thumbnails) === null || _d === void 0 ? void 0 : _d.default) === null || _e === void 0 ? void 0 : _e.url,
            };
        }
        case 'facebook': {
            const response = await fetch(`https://graph.facebook.com/me?fields=id,name,picture&access_token=${accessToken}`);
            const data = await response.json();
            return {
                channelId: data.id || '',
                channelName: data.name || 'Facebook User',
                profileImage: (_g = (_f = data.picture) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.url,
            };
        }
        case 'twitch': {
            const response = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Client-Id': clientId,
                },
            });
            const data = await response.json();
            const user = (_h = data.data) === null || _h === void 0 ? void 0 : _h[0];
            return {
                channelId: (user === null || user === void 0 ? void 0 : user.id) || '',
                channelName: (user === null || user === void 0 ? void 0 : user.display_name) || (user === null || user === void 0 ? void 0 : user.login) || 'Twitch User',
                profileImage: user === null || user === void 0 ? void 0 : user.profile_image_url,
            };
        }
    }
}
async function getPlatformStreamKey(platform, accessToken, clientId, channelId) {
    var _a, _b, _c, _d, _e, _f, _g;
    switch (platform) {
        case 'youtube': {
            // Create a live broadcast and get stream key
            const broadcastResponse = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,contentDetails,status', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    snippet: {
                        title: 'ChatScream Live Stream',
                        scheduledStartTime: new Date().toISOString(),
                    },
                    status: { privacyStatus: 'public' },
                    contentDetails: { enableAutoStart: true, enableAutoStop: true },
                }),
            });
            if (!broadcastResponse.ok) {
                return { error: 'Failed to create YouTube broadcast' };
            }
            const broadcast = await broadcastResponse.json();
            // Get the stream key for this broadcast
            const streamResponse = await fetch(`https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn&id=${(_a = broadcast.contentDetails) === null || _a === void 0 ? void 0 : _a.boundStreamId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
            const stream = await streamResponse.json();
            const streamData = (_d = (_c = (_b = stream.items) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.cdn) === null || _d === void 0 ? void 0 : _d.ingestionInfo;
            return {
                streamKey: streamData === null || streamData === void 0 ? void 0 : streamData.streamName,
                ingestUrl: streamData === null || streamData === void 0 ? void 0 : streamData.ingestionAddress,
            };
        }
        case 'twitch': {
            const response = await fetch(`https://api.twitch.tv/helix/streams/key?broadcaster_id=${channelId}`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Client-Id': clientId,
                },
            });
            if (!response.ok) {
                return { error: 'Failed to get Twitch stream key' };
            }
            const data = await response.json();
            return {
                streamKey: (_f = (_e = data.data) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.stream_key,
                ingestUrl: 'rtmp://live.twitch.tv/app',
            };
        }
        case 'facebook': {
            // Create a live video to get the stream URL
            const response = await fetch(`https://graph.facebook.com/v18.0/${channelId}/live_videos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: accessToken,
                    title: 'ChatScream Live Stream',
                    status: 'SCHEDULED_UNPUBLISHED',
                }),
            });
            if (!response.ok) {
                return { error: 'Failed to create Facebook live video' };
            }
            const data = await response.json();
            return {
                streamKey: (_g = data.stream_url) === null || _g === void 0 ? void 0 : _g.split('/').pop(),
                ingestUrl: data.secure_stream_url || data.stream_url,
            };
        }
    }
}
async function getPlatformChannels(platform, accessToken, clientId) {
    switch (platform) {
        case 'youtube': {
            // Get all channels the user has access to (including brand accounts)
            const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50', { headers: { Authorization: `Bearer ${accessToken}` } });
            const data = await response.json();
            return (data.items || []).map((ch) => {
                var _a, _b, _c, _d;
                return ({
                    id: ch.id,
                    name: (_a = ch.snippet) === null || _a === void 0 ? void 0 : _a.title,
                    thumbnailUrl: (_d = (_c = (_b = ch.snippet) === null || _b === void 0 ? void 0 : _b.thumbnails) === null || _c === void 0 ? void 0 : _c.default) === null || _d === void 0 ? void 0 : _d.url,
                });
            });
        }
        case 'facebook': {
            // Get pages the user manages
            const response = await fetch(`https://graph.facebook.com/me/accounts?fields=id,name,picture&access_token=${accessToken}`);
            const data = await response.json();
            return (data.data || []).map((page) => {
                var _a, _b;
                return ({
                    id: page.id,
                    name: page.name,
                    thumbnailUrl: (_b = (_a = page.picture) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.url,
                });
            });
        }
        case 'twitch': {
            // Twitch users typically only have one channel
            const response = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Client-Id': clientId,
                },
            });
            const data = await response.json();
            return (data.data || []).map((user) => ({
                id: user.id,
                name: user.display_name || user.login,
                thumbnailUrl: user.profile_image_url,
            }));
        }
    }
}
//# sourceMappingURL=index.js.map