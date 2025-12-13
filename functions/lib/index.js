"use strict";
/**
 * ChatScream - Cloud Functions
 *
 * These functions handle:
 * - Stripe checkout session creation
 * - Stripe webhook processing
 * - Customer portal session creation
 * - Affiliate commission tracking
 * - Chat Screamer donation processing
 * - Scream Leaderboard tracking
 */
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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaderboard = exports.stripeWebhook = exports.awardWeeklyPrize = exports.screamWebhook = exports.createScreamDonation = exports.createPortalSession = exports.createCheckoutSession = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
admin.initializeApp();
const db = admin.firestore();
// Initialize Stripe with your secret key
const stripe = new stripe_1.default(((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.secret_key) || process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});
const WEBHOOK_SECRET = ((_b = functions.config().stripe) === null || _b === void 0 ? void 0 : _b.webhook_secret) || process.env.STRIPE_WEBHOOK_SECRET || '';
// Price IDs for plans
const PRICE_IDS = {
    starter: ((_c = functions.config().stripe) === null || _c === void 0 ? void 0 : _c.starter_price) || 'price_starter',
    creator: ((_d = functions.config().stripe) === null || _d === void 0 ? void 0 : _d.creator_price) || 'price_creator',
    pro: ((_e = functions.config().stripe) === null || _e === void 0 ? void 0 : _e.pro_price) || 'price_pro',
};
// Chat Screamer tier thresholds
const SCREAM_TIERS = {
    standard: { min: 5, max: 9.99 },
    loud: { min: 10, max: 49.99 },
    maximum: { min: 50, max: null },
};
// Leaderboard prize value
const LEADERBOARD_PRIZE_VALUE = 59; // $59 Professional tier
/**
 * Create Stripe Checkout Session
 */
exports.createCheckoutSession = functions.https.onRequest(async (req, res) => {
    var _a, _b;
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const { priceId, userId, userEmail, successUrl, cancelUrl, referralCode } = req.body;
        if (!priceId || !userId || !userEmail) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        // Check for existing Stripe customer
        const userDoc = await db.collection('users').doc(userId).get();
        let customerId = (_b = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.subscription) === null || _b === void 0 ? void 0 : _b.stripeCustomerId;
        if (!customerId) {
            // Create new Stripe customer
            const customer = await stripe.customers.create({
                email: userEmail,
                metadata: {
                    firebaseUserId: userId,
                    referralCode: referralCode || '',
                },
            });
            customerId = customer.id;
            // Save customer ID to user profile
            await db.collection('users').doc(userId).update({
                'subscription.stripeCustomerId': customerId,
            });
        }
        // Calculate discount for affiliate referrals
        let discounts = [];
        if (referralCode) {
            // Check if there's a coupon for this affiliate
            const affiliateCoupon = await getOrCreateAffiliateCoupon(referralCode);
            if (affiliateCoupon) {
                discounts = [{ coupon: affiliateCoupon }];
            }
        }
        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: successUrl || `${req.headers.origin}/studio?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${req.headers.origin}/pricing`,
            discounts,
            subscription_data: {
                metadata: {
                    firebaseUserId: userId,
                    referralCode: referralCode || '',
                },
                trial_period_days: referralCode ? 14 : 7, // Extended trial for referrals
            },
            metadata: {
                firebaseUserId: userId,
                referralCode: referralCode || '',
            },
        });
        res.json({ url: session.url, sessionId: session.id });
    }
    catch (error) {
        console.error('Checkout session error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Create Customer Portal Session
 */
exports.createPortalSession = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const { customerId, returnUrl } = req.body;
        if (!customerId) {
            res.status(400).json({ error: 'Customer ID is required' });
            return;
        }
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl || `${req.headers.origin}/studio`,
        });
        res.json({ url: session.url });
    }
    catch (error) {
        console.error('Portal session error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Process Chat Screamer Donation
 * Creates a Stripe PaymentIntent for one-time donations
 */
exports.createScreamDonation = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
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
        if (!amount || !streamerId) {
            res.status(400).json({ error: 'Amount and streamer ID are required' });
            return;
        }
        // Minimum $5 for Chat Screamer
        if (amount < 5) {
            res.status(400).json({ error: 'Minimum donation for Chat Screamer is $5' });
            return;
        }
        // Determine scream tier
        const tier = getScreamTier(amount);
        // Create PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            metadata: {
                type: 'chat_screamer',
                streamerId,
                donorName: donorName || 'Anonymous',
                message: message || '',
                screamTier: tier,
            },
            receipt_email: donorEmail,
            description: `ChatScream - ${tier} Scream for streamer`,
        });
        res.json({
            clientSecret: paymentIntent.client_secret,
            screamTier: tier,
        });
    }
    catch (error) {
        console.error('Scream donation error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Webhook for processing completed scream donations
 */
exports.screamWebhook = functions.https.onRequest(async (req, res) => {
    var _a;
    const sig = req.headers['stripe-signature'];
    if (!sig) {
        res.status(400).send('Missing signature');
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, WEBHOOK_SECRET);
    }
    catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    try {
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            // Check if this is a Chat Screamer donation
            if (((_a = paymentIntent.metadata) === null || _a === void 0 ? void 0 : _a.type) === 'chat_screamer') {
                await processScreamDonation(paymentIntent);
            }
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error('Scream webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Process completed scream donation
 */
async function processScreamDonation(paymentIntent) {
    const { streamerId, donorName, message, screamTier } = paymentIntent.metadata;
    const amount = paymentIntent.amount / 100; // Convert from cents
    // Record the scream
    const screamRef = await db.collection('screams').add({
        streamerId,
        donorName: donorName || 'Anonymous',
        message: message || '',
        amount,
        tier: screamTier,
        paymentIntentId: paymentIntent.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: false,
    });
    // Update streamer's weekly scream count for leaderboard
    await updateScreamLeaderboard(streamerId, amount);
    // Notify streamer (would trigger real-time alert in production)
    await db.collection('scream_alerts').add({
        screamId: screamRef.id,
        streamerId,
        donorName: donorName || 'Anonymous',
        message: message || '',
        amount,
        tier: screamTier,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        displayed: false,
    });
    console.log(`Scream donation processed: ${screamTier} for ${streamerId} - $${amount}`);
}
/**
 * Update Scream Leaderboard
 */
async function updateScreamLeaderboard(streamerId, amount) {
    const weekId = getCurrentWeekId();
    const leaderboardRef = db.collection('scream_leaderboard').doc(weekId);
    // Get or create week's leaderboard
    const leaderboardDoc = await leaderboardRef.get();
    if (!leaderboardDoc.exists) {
        // Create new week's leaderboard
        await leaderboardRef.set({
            weekId,
            weekStart: getWeekStart(),
            weekEnd: getWeekEnd(),
            prizeAwarded: false,
            prizeValue: LEADERBOARD_PRIZE_VALUE,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    // Update streamer's entry
    const entryRef = leaderboardRef.collection('entries').doc(streamerId);
    const entryDoc = await entryRef.get();
    if (entryDoc.exists) {
        await entryRef.update({
            screamCount: admin.firestore.FieldValue.increment(1),
            totalAmount: admin.firestore.FieldValue.increment(amount),
            lastScream: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    else {
        // Get streamer info
        const streamerDoc = await db.collection('users').doc(streamerId).get();
        const streamerData = streamerDoc.data();
        await entryRef.set({
            streamerId,
            streamerName: (streamerData === null || streamerData === void 0 ? void 0 : streamerData.displayName) || 'Unknown',
            screamCount: 1,
            totalAmount: amount,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastScream: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    console.log(`Leaderboard updated for ${streamerId} - Week ${weekId}`);
}
/**
 * Get current week ID (YYYY-WW format)
 */
function getCurrentWeekId() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}
/**
 * Get start of current week (Sunday)
 */
function getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    const sunday = new Date(now.setDate(diff));
    sunday.setHours(0, 0, 0, 0);
    return admin.firestore.Timestamp.fromDate(sunday);
}
/**
 * Get end of current week (Saturday 23:59:59)
 */
function getWeekEnd() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + 6;
    const saturday = new Date(now.setDate(diff));
    saturday.setHours(23, 59, 59, 999);
    return admin.firestore.Timestamp.fromDate(saturday);
}
/**
 * Award Weekly Leaderboard Prize
 * Scheduled to run every Sunday at midnight
 */
exports.awardWeeklyPrize = functions.pubsub
    .schedule('0 0 * * 0') // Every Sunday at midnight
    .timeZone('America/New_York')
    .onRun(async () => {
    var _a;
    const lastWeekId = getLastWeekId();
    const leaderboardRef = db.collection('scream_leaderboard').doc(lastWeekId);
    const leaderboardDoc = await leaderboardRef.get();
    if (!leaderboardDoc.exists || ((_a = leaderboardDoc.data()) === null || _a === void 0 ? void 0 : _a.prizeAwarded)) {
        console.log('No leaderboard to process or prize already awarded');
        return null;
    }
    // Get top streamer
    const entriesSnapshot = await leaderboardRef
        .collection('entries')
        .orderBy('screamCount', 'desc')
        .limit(1)
        .get();
    if (entriesSnapshot.empty) {
        console.log('No entries for this week');
        return null;
    }
    const winner = entriesSnapshot.docs[0].data();
    const winnerId = entriesSnapshot.docs[0].id;
    // Grant free month of Professional tier
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    await db.collection('users').doc(winnerId).update({
        'subscription.plan': 'pro',
        'subscription.status': 'active',
        'subscription.currentPeriodEnd': admin.firestore.Timestamp.fromDate(currentPeriodEnd),
        'subscription.grantedByLeaderboard': true,
        'subscription.leaderboardWinWeek': lastWeekId,
    });
    // Mark prize as awarded
    await leaderboardRef.update({
        prizeAwarded: true,
        winnerId,
        winnerName: winner.streamerName,
        winnerScreamCount: winner.screamCount,
        awardedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Send notification to winner (implement email/push notification)
    await db.collection('notifications').add({
        userId: winnerId,
        type: 'leaderboard_win',
        title: 'You Won the Scream Leaderboard!',
        message: `Congratulations! You received ${winner.screamCount} screams and won a FREE month of Professional tier ($${LEADERBOARD_PRIZE_VALUE} value)!`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    });
    console.log(`Leaderboard prize awarded to ${winner.streamerName} (${winnerId}) - ${winner.screamCount} screams`);
    return null;
});
/**
 * Get last week's ID
 */
function getLastWeekId() {
    const now = new Date();
    now.setDate(now.getDate() - 7);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}
/**
 * Get scream tier based on amount
 */
function getScreamTier(amount) {
    if (amount >= SCREAM_TIERS.maximum.min)
        return 'maximum';
    if (amount >= SCREAM_TIERS.loud.min)
        return 'loud';
    if (amount >= SCREAM_TIERS.standard.min)
        return 'standard';
    return 'none';
}
/**
 * Stripe Webhook Handler
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    var _a;
    const sig = req.headers['stripe-signature'];
    if (!sig) {
        res.status(400).send('Missing signature');
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, WEBHOOK_SECRET);
    }
    catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutComplete(event.data.object);
                break;
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await handleSubscriptionUpdate(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await handleSubscriptionCanceled(event.data.object);
                break;
            case 'invoice.paid':
                await handleInvoicePaid(event.data.object);
                break;
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
            case 'payment_intent.succeeded':
                // Check for Chat Screamer donations
                const paymentIntent = event.data.object;
                if (((_a = paymentIntent.metadata) === null || _a === void 0 ? void 0 : _a.type) === 'chat_screamer') {
                    await processScreamDonation(paymentIntent);
                }
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error('Webhook handler error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Handle Checkout Complete
 */
async function handleCheckoutComplete(session) {
    var _a, _b;
    const userId = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUserId;
    const referralCode = (_b = session.metadata) === null || _b === void 0 ? void 0 : _b.referralCode;
    if (!userId) {
        console.error('No Firebase user ID in session metadata');
        return;
    }
    // Track affiliate commission if referral code present
    if (referralCode) {
        await trackAffiliateCommission(referralCode, session.amount_total || 0);
    }
    console.log(`Checkout completed for user ${userId}`);
}
/**
 * Handle Subscription Update
 */
async function handleSubscriptionUpdate(subscription) {
    var _a;
    const userId = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUserId;
    if (!userId) {
        // Try to find user by customer ID
        const customerId = subscription.customer;
        const usersSnapshot = await db
            .collection('users')
            .where('subscription.stripeCustomerId', '==', customerId)
            .limit(1)
            .get();
        if (usersSnapshot.empty) {
            console.error('Could not find user for subscription');
            return;
        }
        const userDoc = usersSnapshot.docs[0];
        await updateUserSubscription(userDoc.id, subscription);
    }
    else {
        await updateUserSubscription(userId, subscription);
    }
}
async function updateUserSubscription(userId, subscription) {
    var _a;
    const planId = getPlanIdFromPriceId(((_a = subscription.items.data[0]) === null || _a === void 0 ? void 0 : _a.price.id) || '');
    const subscriptionData = {
        plan: planId,
        status: mapStripeStatus(subscription.status),
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
    };
    if (subscription.trial_end) {
        Object.assign(subscriptionData, {
            trialEndsAt: admin.firestore.Timestamp.fromMillis(subscription.trial_end * 1000),
        });
    }
    await db.collection('users').doc(userId).update({
        subscription: subscriptionData,
    });
    console.log(`Updated subscription for user ${userId} to plan ${planId}`);
}
/**
 * Handle Subscription Canceled
 */
async function handleSubscriptionCanceled(subscription) {
    const customerId = subscription.customer;
    const usersSnapshot = await db
        .collection('users')
        .where('subscription.stripeCustomerId', '==', customerId)
        .limit(1)
        .get();
    if (!usersSnapshot.empty) {
        const userDoc = usersSnapshot.docs[0];
        await db.collection('users').doc(userDoc.id).update({
            'subscription.plan': 'free',
            'subscription.status': 'canceled',
        });
        console.log(`Subscription canceled for user ${userDoc.id}`);
    }
}
/**
 * Handle Invoice Paid - Track Affiliate Commission
 */
async function handleInvoicePaid(invoice) {
    var _a;
    const subscriptionId = invoice.subscription;
    if (!subscriptionId)
        return;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const referralCode = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.referralCode;
    if (referralCode) {
        await trackAffiliateCommission(referralCode, invoice.amount_paid);
    }
}
/**
 * Handle Payment Failed
 */
async function handlePaymentFailed(invoice) {
    const customerId = invoice.customer;
    const usersSnapshot = await db
        .collection('users')
        .where('subscription.stripeCustomerId', '==', customerId)
        .limit(1)
        .get();
    if (!usersSnapshot.empty) {
        const userDoc = usersSnapshot.docs[0];
        await db.collection('users').doc(userDoc.id).update({
            'subscription.status': 'past_due',
        });
        console.log(`Payment failed for user ${userDoc.id}`);
    }
}
/**
 * Track Affiliate Commission
 */
async function trackAffiliateCommission(referralCode, amountInCents) {
    // MMM code gets 40% commission
    const commissionRate = referralCode.toUpperCase() === 'MMM' ? 0.40 : 0.20;
    const commission = Math.round(amountInCents * commissionRate);
    // Record the commission
    await db.collection('affiliate_commissions').add({
        affiliateCode: referralCode.toUpperCase(),
        amount: amountInCents,
        commission: commission,
        commissionRate: commissionRate,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
    });
    // Update affiliate totals
    if (referralCode.toUpperCase() === 'MMM') {
        // Track in special Mythical Meta collection
        await db.collection('partners').doc('mythical-meta').set({
            totalEarnings: admin.firestore.FieldValue.increment(commission),
            pendingPayout: admin.firestore.FieldValue.increment(commission),
            lastCommission: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    else {
        // Update user affiliate stats
        const affiliateDoc = await db.collection('affiliates').doc(referralCode.toUpperCase()).get();
        if (affiliateDoc.exists) {
            await affiliateDoc.ref.update({
                totalEarnings: admin.firestore.FieldValue.increment(commission),
                pendingPayout: admin.firestore.FieldValue.increment(commission),
            });
        }
    }
    console.log(`Tracked commission of ${commission} cents for affiliate ${referralCode}`);
}
/**
 * Get or Create Affiliate Coupon
 */
async function getOrCreateAffiliateCoupon(referralCode) {
    try {
        // Check if coupon exists
        const couponId = `affiliate_${referralCode.toUpperCase()}`;
        try {
            await stripe.coupons.retrieve(couponId);
            return couponId;
        }
        catch (_a) {
            // Coupon doesn't exist, create it
            // MMM gets 10% off for referred users
            const percentOff = referralCode.toUpperCase() === 'MMM' ? 10 : 5;
            await stripe.coupons.create({
                id: couponId,
                percent_off: percentOff,
                duration: 'forever',
                name: `Referral from ${referralCode.toUpperCase()}`,
            });
            return couponId;
        }
    }
    catch (error) {
        console.error('Error with affiliate coupon:', error);
        return null;
    }
}
/**
 * Map Stripe status to our status
 */
function mapStripeStatus(stripeStatus) {
    switch (stripeStatus) {
        case 'trialing':
            return 'trialing';
        case 'active':
            return 'active';
        case 'canceled':
        case 'unpaid':
            return 'canceled';
        case 'past_due':
            return 'past_due';
        default:
            return 'active';
    }
}
/**
 * Get plan ID from Stripe price ID
 */
function getPlanIdFromPriceId(priceId) {
    if (priceId === PRICE_IDS.starter)
        return 'starter';
    if (priceId === PRICE_IDS.creator)
        return 'creator';
    if (priceId === PRICE_IDS.pro)
        return 'pro';
    return 'free';
}
/**
 * Get Leaderboard API
 * Returns current week's leaderboard
 */
exports.getLeaderboard = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const weekId = getCurrentWeekId();
        const leaderboardRef = db.collection('scream_leaderboard').doc(weekId);
        const entriesSnapshot = await leaderboardRef
            .collection('entries')
            .orderBy('screamCount', 'desc')
            .limit(100)
            .get();
        const entries = entriesSnapshot.docs.map((doc, index) => (Object.assign({ rank: index + 1 }, doc.data())));
        res.json({
            weekId,
            weekStart: getWeekStart().toDate(),
            weekEnd: getWeekEnd().toDate(),
            entries,
            prizeValue: LEADERBOARD_PRIZE_VALUE,
        });
    }
    catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: error.message });
    }
});
//# sourceMappingURL=index.js.map