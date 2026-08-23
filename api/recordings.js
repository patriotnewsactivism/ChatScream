import {
  applyAccessOverrides,
  getSession,
  getUserByUid,
  initIdentityStorage,
  putUser,
} from '../server/store.js';

let initPromise = null;
const ensureStore = () => {
  if (!initPromise) initPromise = initIdentityStorage();
  return initPromise;
};

const QUOTAS_GB = (() => {
  try {
    return {
      free: 1,
      pro: 25,
      expert: 100,
      enterprise: 250,
      business: 500,
      ...JSON.parse(process.env.CLOUD_RECORDING_QUOTAS_GB || '{}'),
    };
  } catch {
    return { free: 1, pro: 25, expert: 100, enterprise: 250, business: 500 };
  }
})();

const readBearer = (req) => {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
};

const authenticate = async (req) => {
  await ensureStore();
  const token = readBearer(req);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const record = await getUserByUid(session.uid);
  if (!record) return null;
  const profile = applyAccessOverrides({
    ...record.profile,
    uid: record.uid,
    email: record.email,
  });
  return { token, session, record, profile };
};

const quotaForProfile = (profile) => {
  const plan = String(profile?.subscription?.plan || 'free');
  const gb = Number(QUOTAS_GB[plan] ?? 0);
  return Math.max(0, gb) * 1024 * 1024 * 1024;
};

const cleanRecordings = (profile) =>
  (Array.isArray(profile?.recordings) ? profile.recordings : [])
    .filter((item) => item && typeof item === 'object')
    .slice(-200);

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const recordings = cleanRecordings(auth.profile);
  const quotaBytes = quotaForProfile(auth.profile);
  const usedBytes = recordings.reduce((sum, item) => sum + Math.max(0, Number(item.sizeBytes) || 0), 0);
  const plan = String(auth.profile?.subscription?.plan || 'free');

  if (req.method === 'GET') {
    res.status(200).json({
      recordings: [...recordings].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      storage: {
        plan,
        quotaBytes,
        usedBytes,
        remainingBytes: Math.max(0, quotaBytes - usedBytes),
        cloudRecordingAllowed: quotaBytes > usedBytes,
      },
    });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const id = String(body.id || '').trim();
    const url = String(body.url || '').trim();
    const storageKey = String(body.storageKey || '').trim();
    const sizeBytes = Math.max(0, Number(body.sizeBytes) || 0);
    const durationSeconds = Math.max(0, Number(body.durationSeconds) || 0);

    if (
      !id ||
      (url && !/^https:\/\//i.test(url)) ||
      !storageKey.startsWith('recordings/') ||
      sizeBytes <= 0
    ) {
      res.status(400).json({ message: 'Invalid recording metadata.' });
      return;
    }

    if (quotaBytes <= 0 || usedBytes + sizeBytes > quotaBytes) {
      res.status(403).json({ message: 'Cloud recording storage quota exceeded for this plan.' });
      return;
    }

    const item = {
      id,
      title: String(body.title || `Live show ${new Date().toLocaleDateString()}`).slice(0, 160),
      url,
      storageKey,
      sizeBytes,
      durationSeconds,
      format: String(body.format || 'mkv').slice(0, 20),
      createdAt: String(body.createdAt || new Date().toISOString()),
      destinations: Array.isArray(body.destinations)
        ? body.destinations.map((value) => String(value).slice(0, 40)).slice(0, 12)
        : [],
    };

    const next = recordings.filter((recording) => recording.id !== item.id);
    next.push(item);

    const nextProfile = {
      ...auth.profile,
      recordings: next.slice(-200),
    };
    await putUser({ ...auth.record, profile: nextProfile });

    res.status(201).json({ recording: item });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ message: 'Method not allowed.' });
}