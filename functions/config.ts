import { z } from 'zod';

const functionsEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  YOUTUBE_CLIENT_ID: z.string().min(1).optional(),
  YOUTUBE_CLIENT_SECRET: z.string().min(1).optional(),
  FACEBOOK_APP_ID: z.string().min(1).optional(),
  FACEBOOK_APP_SECRET: z.string().min(1).optional(),
  TWITCH_CLIENT_ID: z.string().min(1).optional(),
  TWITCH_CLIENT_SECRET: z.string().min(1).optional(),
  CLAUDE_API_KEY: z.string().min(1).optional(),
});

const normalizeSecret = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export const loadFunctionsEnv = (env: NodeJS.ProcessEnv) => {
  const parsed = functionsEnvSchema.safeParse({
    STRIPE_SECRET_KEY: normalizeSecret(env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: normalizeSecret(env.STRIPE_WEBHOOK_SECRET),
    YOUTUBE_CLIENT_ID: normalizeSecret(env.YOUTUBE_CLIENT_ID),
    YOUTUBE_CLIENT_SECRET: normalizeSecret(env.YOUTUBE_CLIENT_SECRET),
    FACEBOOK_APP_ID: normalizeSecret(env.FACEBOOK_APP_ID),
    FACEBOOK_APP_SECRET: normalizeSecret(env.FACEBOOK_APP_SECRET),
    TWITCH_CLIENT_ID: normalizeSecret(env.TWITCH_CLIENT_ID),
    TWITCH_CLIENT_SECRET: normalizeSecret(env.TWITCH_CLIENT_SECRET),
    CLAUDE_API_KEY: normalizeSecret(env.CLAUDE_API_KEY),
  });

  if (!parsed.success) {
    const issues = parsed.error?.issues?.map((issue) => `${issue.path.join('.')}: ${issue.message}`) || [];
    const errorMessage = issues.length ? issues.join('; ') : 'Unknown environment validation error';
    console.warn(`Cloud Functions environment validation warning: ${errorMessage}`);
    // Return empty object with defaults if validation fails during deployment analysis
    return {
      STRIPE_SECRET_KEY: normalizeSecret(env.STRIPE_SECRET_KEY) || '',
      STRIPE_WEBHOOK_SECRET: normalizeSecret(env.STRIPE_WEBHOOK_SECRET) || '',
      YOUTUBE_CLIENT_ID: normalizeSecret(env.YOUTUBE_CLIENT_ID),
      YOUTUBE_CLIENT_SECRET: normalizeSecret(env.YOUTUBE_CLIENT_SECRET),
      FACEBOOK_APP_ID: normalizeSecret(env.FACEBOOK_APP_ID),
      FACEBOOK_APP_SECRET: normalizeSecret(env.FACEBOOK_APP_SECRET),
      TWITCH_CLIENT_ID: normalizeSecret(env.TWITCH_CLIENT_ID),
      TWITCH_CLIENT_SECRET: normalizeSecret(env.TWITCH_CLIENT_SECRET),
      CLAUDE_API_KEY: normalizeSecret(env.CLAUDE_API_KEY),
    };
  }

  return parsed.data;
};

export const functionsEnv = loadFunctionsEnv(process.env);
