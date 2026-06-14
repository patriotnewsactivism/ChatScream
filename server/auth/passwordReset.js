import { createHash, randomBytes } from 'node:crypto';

const DEFAULT_RESET_TTL_SECONDS = 15 * 60;
const DEFAULT_EMAIL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_EMAIL_RATE_LIMIT_MAX = 5;
const DEFAULT_CONFIRM_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_CONFIRM_RATE_LIMIT_MAX = 10;

const emailResetRateMap = new Map();
const confirmResetRateMap = new Map();

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const nowMs = () => Date.now();
const nowIso = () => new Date().toISOString();
const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const hashToken = (token) => createHash('sha256').update(String(token || '')).digest('hex');

const hashPassword = (value = '') => createHash('sha256').update(value).digest('hex');

const buildResetUrl = (rawToken) => {
  const configured = String(process.env.PASSWORD_RESET_URL || process.env.APP_BASE_URL || '').trim();
  if (!configured) {
    return `/reset-password/confirm?token=${encodeURIComponent(rawToken)}`;
  }
  const url = new URL(configured);
  url.searchParams.set('token', rawToken);
  return url.toString();
};

const createRateLimiter = (store, windowMs, maxRequests) => (key) => {
  const currentTs = nowMs();
  const active = store.get(key);
  if (!active || active.resetAt <= currentTs) {
    store.set(key, { count: 1, resetAt: currentTs + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (active.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((active.resetAt - currentTs) / 1000)),
    };
  }
  active.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
};

const takeEmailResetRateLimit = createRateLimiter(
  emailResetRateMap,
  numberFromEnv(process.env.AUTH_RESET_RATE_LIMIT_WINDOW_MS, DEFAULT_EMAIL_RATE_LIMIT_WINDOW_MS),
  numberFromEnv(process.env.AUTH_RESET_RATE_LIMIT_MAX, DEFAULT_EMAIL_RATE_LIMIT_MAX),
);

const takeConfirmRateLimit = createRateLimiter(
  confirmResetRateMap,
  numberFromEnv(
    process.env.AUTH_RESET_CONFIRM_RATE_LIMIT_WINDOW_MS,
    DEFAULT_CONFIRM_RATE_LIMIT_WINDOW_MS,
  ),
  numberFromEnv(process.env.AUTH_RESET_CONFIRM_RATE_LIMIT_MAX, DEFAULT_CONFIRM_RATE_LIMIT_MAX),
);

export const getGenericResetResponse = () => ({
  success: true,
  message: 'If an account exists for this email, a password reset link has been sent.',
});

export const issuePasswordResetToken = async ({ email, ip, getUserByEmail, savePasswordResetToken }) => {
  const normalizedEmail = normalizeEmail(email);
  const throttleKey = `${ip || 'unknown'}:${normalizedEmail || 'empty'}`;
  const rate = takeEmailResetRateLimit(throttleKey);
  if (!rate.allowed) {
    return { ...getGenericResetResponse(), rateLimited: true };
  }

  if (!normalizedEmail) {
    return getGenericResetResponse();
  }

  const userRecord = await getUserByEmail(normalizedEmail);
  if (!userRecord) {
    return getGenericResetResponse();
  }

  const rawToken = randomBytes(32).toString('base64url');
  const expiresInSeconds = numberFromEnv(
    process.env.AUTH_RESET_TOKEN_TTL_SECONDS,
    DEFAULT_RESET_TTL_SECONDS,
  );
  const expiresAt = new Date(nowMs() + expiresInSeconds * 1000).toISOString();
  await savePasswordResetToken({
    tokenHash: hashToken(rawToken),
    uid: userRecord.uid,
    expiresAt,
    createdAt: nowIso(),
    usedAt: null,
  });

  return {
    ...getGenericResetResponse(),
    email: userRecord.email,
    token: rawToken,
    expiresAt,
  };
};

const sendViaWebhook = async ({ to, subject, text, html }) => {
  const url = String(process.env.PASSWORD_RESET_WEBHOOK_URL || '').trim();
  if (!url) throw new Error('PASSWORD_RESET_WEBHOOK_URL is not configured.');
  const authToken = String(process.env.PASSWORD_RESET_WEBHOOK_TOKEN || '').trim();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ to, subject, text, html }),
  });
  if (!response.ok) {
    throw new Error(`Password reset webhook failed (${response.status}).`);
  }
};

const sendViaResend = async ({ to, subject, text, html }) => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.PASSWORD_RESET_EMAIL_FROM || '').trim();
  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY and PASSWORD_RESET_EMAIL_FROM must be configured.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!response.ok) {
    throw new Error(`Resend API request failed (${response.status}).`);
  }
};

export const dispatchPasswordResetEmail = async ({ email, token }) => {
  if (!email || !token) return;
  const provider = String(process.env.PASSWORD_RESET_EMAIL_PROVIDER || 'log')
    .trim()
    .toLowerCase();
  const resetUrl = buildResetUrl(token);
  const subject = 'Reset your ChatScream password';
  const text = `Use this link to reset your password: ${resetUrl}`;
  const html = `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;

  if (provider === 'resend') {
    await sendViaResend({ to: email, subject, text, html });
    return;
  }
  if (provider === 'webhook') {
    await sendViaWebhook({ to: email, subject, text, html });
    return;
  }
  console.info('[auth] password reset email', { provider: 'log', to: email, resetUrl });
};

export const confirmPasswordReset = async ({
  token,
  nextPassword,
  ip,
  consumePasswordResetToken,
  getUserByUid,
  putUser,
  hashPassword,
}) => {
  const rate = takeConfirmRateLimit(ip || 'unknown');
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      body: { message: 'Too many reset attempts. Please try again later.' },
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const normalizedToken = String(token || '').trim();
  const password = String(nextPassword || '');
  if (!normalizedToken || !password || password.length < 6) {
    return { ok: false, status: 400, body: { message: 'Invalid or expired token.' } };
  }

  const tokenRecord = await consumePasswordResetToken(hashToken(normalizedToken));
  if (!tokenRecord) {
    return { ok: false, status: 400, body: { message: 'Invalid or expired token.' } };
  }

  const userRecord = await getUserByUid(tokenRecord.uid);
  if (!userRecord) {
    return { ok: false, status: 400, body: { message: 'Invalid or expired token.' } };
  }

  const hasher = hashPassword ?? ((v) => createHash('sha256').update(v).digest('hex'));
  await putUser({
    ...userRecord,
    passwordHash: await hasher(password),
  });
  return { ok: true, status: 200, body: { success: true } };
};

export const resetPasswordResetInternalsForTests = () => {
  emailResetRateMap.clear();
  confirmResetRateMap.clear();
};
