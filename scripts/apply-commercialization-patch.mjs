import fs from 'node:fs';

const replaceRequired = (text, search, replacement, label) => {
  const next = typeof search === 'string' ? text.replace(search, replacement) : text.replace(search, replacement);
  if (next === text) throw new Error(`Required replacement did not match: ${label}`);
  return next;
};

const replaceOptional = (text, search, replacement) => text.replace(search, replacement);

// ---- server/app.js ---------------------------------------------------------
const appPath = 'server/app.js';
let app = fs.readFileSync(appPath, 'utf8');

if (!app.includes("./commercial/router.js")) {
  app = replaceRequired(
    app,
    "} from './ai.js';\n",
    "} from './ai.js';\nimport commercialRouter from './commercial/router.js';\nimport { DEFAULT_AFFILIATE_COMMISSION_RATE, findAffiliateByCode, recordDurableReferral } from './commercial/affiliate.js';\n",
    'commercial imports',
  );
}

if (!app.includes("app.use('/api/cloud-v2', requireAuth, commercialRouter);")) {
  app = replaceRequired(
    app,
    '\n// Multer Setup\n',
    "\napp.use('/api/cloud-v2', requireAuth, commercialRouter);\n\n// Multer Setup\n",
    'commercial router mount',
  );
}

app = replaceRequired(
  app,
  /const PLAN_HOURS = \{\n  free: 0,\n  pro: \d+,\n  expert: \d+,\n  enterprise: \d+,\n\};/,
  "const PLAN_HOURS = {\n  free: 0,\n  pro: 2,\n  expert: 8,\n  enterprise: 20,\n  business: 40,\n};",
  'legacy cloud limits',
);

app = replaceOptional(app, 'maxDestinations: 5,', 'maxDestinations: 10,');
app = replaceOptional(
  app,
  'commissionRate: 0.2,',
  'commissionRate: DEFAULT_AFFILIATE_COMMISSION_RATE,',
);
app = replaceOptional(
  app,
  "const referredAffiliate = referralCode ? getAffiliate(referralCode) : null;",
  "const referredAffiliate = referralCode ? await findAffiliateByCode(referralCode) : null;",
);
app = replaceOptional(
  app,
  "plan: makeAdmin ? 'enterprise' : record.profile.subscription?.plan || 'free',",
  "plan: makeAdmin ? 'business' : record.profile.subscription?.plan || 'free',",
);

if (!app.includes('recordDurableReferral({\n          referredUserId: uid,')) {
  app = replaceRequired(
    app,
    /    await putUser\(\{\n      uid,\n      email,\n      passwordHash: await hashPassword\(password\),\n      passwordAlgorithm: PASSWORD_HASH_ALGORITHM,\n      profile,\n    \}\);\n\n    const payload = await buildSessionPayload\(uid\);/,
    `    await putUser({\n      uid,\n      email,\n      passwordHash: await hashPassword(password),\n      passwordAlgorithm: PASSWORD_HASH_ALGORITHM,\n      profile,\n    });\n\n    if (referredAffiliate?.isActive) {\n      await recordDurableReferral({\n        referredUserId: uid,\n        referralCode: referredAffiliate.code,\n        referrerId: referredAffiliate.ownerId,\n      });\n    }\n\n    const payload = await buildSessionPayload(uid);`,
    'durable signup referral attribution',
  );
}

fs.writeFileSync(appPath, app);

// ---- services/cloudStreamingService.ts ------------------------------------
const cloudClientPath = 'services/cloudStreamingService.ts';
let cloudClient = fs.readFileSync(cloudClientPath, 'utf8');
cloudClient = cloudClient
  .replaceAll('/api/cloud-streaming/status', '/api/cloud-v2/status')
  .replaceAll('/api/cloud-streaming/sessions/start', '/api/cloud-v2/sessions/start')
  .replaceAll('/api/cloud-streaming/sessions/end', '/api/cloud-v2/sessions/end')
  .replaceAll('/api/cloud-streaming/reset', '/api/cloud-v2/reset')
  .replaceAll('/api/cloud-streaming/sessions/active', '/api/cloud-v2/sessions/active');
fs.writeFileSync(cloudClientPath, cloudClient);

// ---- services/backend.ts ---------------------------------------------------
const backendPath = 'services/backend.ts';
let backend = fs.readFileSync(backendPath, 'utf8');
backend = replaceOptional(
  backend,
  "export type PlanTier = 'free' | 'pro' | 'expert' | 'enterprise';",
  "export type PlanTier = 'free' | 'pro' | 'expert' | 'enterprise' | 'business';",
);
fs.writeFileSync(backendPath, backend);

// ---- server/store.js -------------------------------------------------------
const storePath = 'server/store.js';
let store = fs.readFileSync(storePath, 'utf8');
store = replaceOptional(
  store,
  "const nextPlan = isBetaTester ? 'enterprise' : profile.subscription?.plan || 'free';",
  "const nextPlan = isBetaTester ? 'business' : profile.subscription?.plan || 'free';",
);
fs.writeFileSync(storePath, store);

// ---- root admin tests ------------------------------------------------------
const adminTestPath = 'server/__tests__/root-admin-access.test.ts';
if (fs.existsSync(adminTestPath)) {
  let tests = fs.readFileSync(adminTestPath, 'utf8');
  tests = tests.replaceAll("plan).toBe('enterprise')", "plan).toBe('business')");
  tests = tests.replaceAll("plan: 'enterprise'", "plan: 'business'");
  fs.writeFileSync(adminTestPath, tests);
}

// ---- durable referral count migration ------------------------------------
const affiliatePath = 'server/commercial/affiliate.js';
let affiliate = fs.readFileSync(affiliatePath, 'utf8');
affiliate = replaceRequired(
  affiliate,
  `  const existingReferrerId = String(referred.profile?.referredByUserId || '').trim();\n  if (existingReferrerId) {\n    return {\n      recorded: existingReferrerId === referrer.uid,\n      reason: existingReferrerId === referrer.uid ? 'already_recorded' : 'already_attributed',\n    };\n  }\n\n  const referredProfile = {\n    ...referred.profile,\n    referredByCode: affiliate.code,\n    referredByUserId: referrer.uid,\n    referralAttributedAt: nowIso(),\n  };`,
  `  const existingReferrerId = String(referred.profile?.referredByUserId || '').trim();\n  if (existingReferrerId && existingReferrerId !== referrer.uid) {\n    return { recorded: false, reason: 'already_attributed' };\n  }\n  if (existingReferrerId === referrer.uid && referred.profile?.referralCountedAt) {\n    return { recorded: true, reason: 'already_recorded' };\n  }\n\n  const referredProfile = {\n    ...referred.profile,\n    referredByCode: affiliate.code,\n    referredByUserId: referrer.uid,\n    referralAttributedAt: referred.profile?.referralAttributedAt || nowIso(),\n    referralCountedAt: nowIso(),\n  };`,
  'durable referral idempotency',
);
fs.writeFileSync(affiliatePath, affiliate);

console.log('Commercialization wiring patch applied.');
