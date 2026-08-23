import fs from 'node:fs';

const replaceRequired = (text, search, replacement, label) => {
  const next = text.replace(search, replacement);
  if (next === text) throw new Error(`Required replacement did not match: ${label}`);
  return next;
};

// server/app.js
const appPath = 'server/app.js';
let app = fs.readFileSync(appPath, 'utf8');
if (!app.includes("./commercial/publicRouter.js")) {
  app = replaceRequired(
    app,
    "import commercialRouter from './commercial/router.js';\n",
    "import commercialRouter from './commercial/router.js';\nimport publicCommercialRouter from './commercial/publicRouter.js';\n",
    'public commercial router import',
  );
}
if (!app.includes("app.use('/api/public/commercial', publicCommercialRouter);")) {
  app = replaceRequired(
    app,
    "app.use('/api/cloud-v2', requireAuth, commercialRouter);",
    "app.use('/api/public/commercial', publicCommercialRouter);\napp.use('/api/cloud-v2', requireAuth, commercialRouter);",
    'public commercial router mount',
  );
}

// The durable attribution call below the user write is authoritative. Remove the
// old local-runtime registry update so one signup is never counted twice.
app = app.replace(
`    if (referredAffiliate?.isActive) {\n      setAffiliate({\n        ...referredAffiliate,\n        totalReferrals: Number(referredAffiliate.totalReferrals || 0) + 1,\n      });\n      addReferral({\n        id: randomUUID(),\n        affiliateCode: referredAffiliate.code,\n        referrerId: referredAffiliate.ownerId,\n        referredUserId: uid,\n        createdAt: nowIso(),\n      });\n    }\n\n`,
'',
);
fs.writeFileSync(appPath, app);

// services/backend.ts
const backendPath = 'services/backend.ts';
let backend = fs.readFileSync(backendPath, 'utf8');
backend = backend
  .replaceAll("? ('enterprise' as PlanTier)", "? ('business' as PlanTier)")
  .replaceAll("plan: isAdmin ? ('enterprise' as PlanTier) : 'free'", "plan: isAdmin ? ('business' as PlanTier) : 'free'")
  .replace("commissionRate: typeof raw.commissionRate === 'number' ? raw.commissionRate : 0.2,", "commissionRate: typeof raw.commissionRate === 'number' ? raw.commissionRate : 0.5,");

backend = replaceRequired(
  backend,
`  usage: {\n    cloudHoursUsed: number;\n    cloudHoursResetAt?: TimestampLike;\n    lastStreamDate?: TimestampLike;\n    activeCloudSession?: {\n      sessionId: string;\n      startTime?: TimestampLike;\n      destinationCount?: number;\n    } | null;\n  };\n  affiliate?: {\n    code: string;\n    referredBy?: string;\n    referredByUserId?: string;\n    referrals: number;\n    totalEarnings: number;\n    pendingPayout: number;\n  };`,
`  usage: {\n    cloudHoursUsed: number;\n    cloudHoursResetAt?: TimestampLike;\n    lastStreamDate?: TimestampLike;\n    includedHoursUsed?: number;\n    overageHours?: number;\n    overageAmountCents?: number;\n    activeCloudSession?: {\n      sessionId: string;\n      startTime?: TimestampLike;\n      destinationCount?: number;\n    } | null;\n  };\n  affiliate?: {\n    code: string;\n    referredBy?: string;\n    referredByUserId?: string;\n    referrals: number;\n    commissionRate?: number;\n    totalEarnings: number;\n    pendingPayout: number;\n    paidOut?: number;\n  };`,
  'profile commercial fields',
);

backend = replaceRequired(
  backend,
`    usage: {\n      cloudHoursUsed: typeof raw.usage?.cloudHoursUsed === 'number' ? raw.usage.cloudHoursUsed : 0,\n      cloudHoursResetAt: raw.usage?.cloudHoursResetAt,\n      lastStreamDate: raw.usage?.lastStreamDate,\n      activeCloudSession: raw.usage?.activeCloudSession || null,\n    },`,
`    usage: {\n      cloudHoursUsed:\n        typeof (raw.usage as any)?.cloud?.cloudHoursUsed === 'number'\n          ? (raw.usage as any).cloud.cloudHoursUsed\n          : typeof raw.usage?.cloudHoursUsed === 'number'\n            ? raw.usage.cloudHoursUsed\n            : 0,\n      cloudHoursResetAt: (raw.usage as any)?.cloud?.resetAt || raw.usage?.cloudHoursResetAt,\n      lastStreamDate: (raw.usage as any)?.cloud?.lastStreamDate || raw.usage?.lastStreamDate,\n      includedHoursUsed:\n        typeof (raw.usage as any)?.cloud?.includedHoursUsed === 'number'\n          ? (raw.usage as any).cloud.includedHoursUsed\n          : undefined,\n      overageHours:\n        typeof (raw.usage as any)?.cloud?.overageHours === 'number'\n          ? (raw.usage as any).cloud.overageHours\n          : undefined,\n      overageAmountCents:\n        typeof (raw.usage as any)?.cloud?.overageAmountCents === 'number'\n          ? (raw.usage as any).cloud.overageAmountCents\n          : undefined,\n      activeCloudSession:\n        (raw.usage as any)?.cloud?.activeCloudSession || raw.usage?.activeCloudSession || null,\n    },`,
  'nested durable cloud usage normalization',
);

backend = replaceRequired(
  backend,
`            referrals: typeof raw.affiliate.referrals === 'number' ? raw.affiliate.referrals : 0,\n            totalEarnings:\n              typeof raw.affiliate.totalEarnings === 'number' ? raw.affiliate.totalEarnings : 0,\n            pendingPayout:\n              typeof raw.affiliate.pendingPayout === 'number' ? raw.affiliate.pendingPayout : 0,`,
`            referrals: typeof raw.affiliate.referrals === 'number' ? raw.affiliate.referrals : 0,\n            commissionRate:\n              typeof (raw.affiliate as any).commissionRate === 'number'\n                ? (raw.affiliate as any).commissionRate\n                : 0.5,\n            totalEarnings:\n              typeof raw.affiliate.totalEarnings === 'number' ? raw.affiliate.totalEarnings : 0,\n            pendingPayout:\n              typeof raw.affiliate.pendingPayout === 'number' ? raw.affiliate.pendingPayout : 0,\n            paidOut:\n              typeof (raw.affiliate as any).paidOut === 'number'\n                ? (raw.affiliate as any).paidOut\n                : 0,`,
  'affiliate profile normalization',
);

backend = replaceRequired(
  backend,
`    [\n      () => authRequest(\`/api/affiliates/\${encodeURIComponent(normalizedCode)}\`),`,
`    [\n      () => apiRequest(\`/api/public/commercial/affiliate/\${encodeURIComponent(normalizedCode)}\`),\n      () => authRequest(\`/api/affiliates/\${encodeURIComponent(normalizedCode)}\`),`,
  'public referral validation endpoint',
);
fs.writeFileSync(backendPath, backend);

// services/cloudStreamingService.ts
const cloudPath = 'services/cloudStreamingService.ts';
let cloud = fs.readFileSync(cloudPath, 'utf8');
cloud = cloud.replace(
`export interface CloudSessionStartOptions {\n  quality?: CloudStreamQuality;\n  resolution?: CloudStreamQuality;\n  bitrateKbps?: number;\n  instanceProfile?: CloudInstanceProfile;\n  storageGb?: number;\n}`,
`export interface CloudDestinationInput {\n  id?: string;\n  platform?: string;\n  ingestUrl?: string;\n  rtmpUrl?: string;\n  url?: string;\n  streamKey?: string;\n  enabled?: boolean;\n}\n\nexport interface CloudSessionStartOptions {\n  quality?: CloudStreamQuality;\n  resolution?: CloudStreamQuality;\n  bitrateKbps?: number;\n  instanceProfile?: CloudInstanceProfile;\n  storageGb?: number;\n  sourceUrl?: string;\n  destinations?: CloudDestinationInput[];\n  recording?: boolean;\n}`,
);
cloud = cloud
  .replace('✅ Server API routes: Complete — /api/cloud-streaming/* endpoints in server/app.js', '✅ Durable server control plane: /api/cloud-v2/*')
  .replace('⏳ EC2 Backend: NOT YET DEPLOYED — server routes return mock/seeded data', '⏳ Worker provider: intentionally fail-closed until CLOUD_WORKER_API_URL/TOKEN are configured')
  .replace('1. Provision EC2 instances (GPU-capable, e.g. g4dn.xlarge) with OBS or ffmpeg relay', '1. Provision a compatible autoscaled FFmpeg worker provider')
  .replace('2. Implement /api/cloud-v2/sessions/start to spin up EC2 instance', '2. Configure CLOUD_WORKER_API_URL/TOKEN')
  .replace('3. Implement /api/cloud-v2/sessions/end to tear down instance', '3. Verify start/stop/checkpoint behavior end-to-end')
  .replace('4. Wire WebRTC or RTMP ingest from browser to cloud instance', '4. Enable browser ingest and URL-to-live source selection in the Studio UI')
  .replace('5. Route cloud output to RTMP destinations (YouTube, Twitch, etc.)', '5. Validate destination-specific CBR output and recovery')
  .replace('6. Add billing integration to track actual cloud hours consumed', '6. Send pending overage usage to the billing provider after reconciliation');
fs.writeFileSync(cloudPath, cloud);

// server/commercial/router.js
const routerPath = 'server/commercial/router.js';
let router = fs.readFileSync(routerPath, 'utf8');
router = router.replace(
'      overageAmountCents: Number(usage.overageAmountCents || 0),\n      activeSession:',
'      overageAmountCents: Number(usage.overageAmountCents || 0),\n      resetDate: usage.resetAt || null,\n      activeSession:',
);
fs.writeFileSync(routerPath, router);

console.log('Final commercialization cleanup applied.');
