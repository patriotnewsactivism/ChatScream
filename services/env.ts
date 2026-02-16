import { z } from 'zod';

const clientEnvSchema = z.object({
  VITE_GEMINI_API_KEY: z.string().min(1).optional(),
  VITE_SENTRY_DSN: z.string().min(1).optional(),
  VITE_API_BASE_URL: z.string().url().optional(),
  VITE_FUNCTIONS_BASE_URL: z.string().url().optional(),
});

const normalizeEnvValue = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export const loadClientEnv = (env: Record<string, string | undefined>) => {
  const parsed = clientEnvSchema.safeParse({
    VITE_GEMINI_API_KEY: normalizeEnvValue(env.VITE_GEMINI_API_KEY),
    VITE_SENTRY_DSN: normalizeEnvValue(env.VITE_SENTRY_DSN),
    VITE_API_BASE_URL: normalizeEnvValue(env.VITE_API_BASE_URL),
    VITE_FUNCTIONS_BASE_URL: normalizeEnvValue(env.VITE_FUNCTIONS_BASE_URL),
  });

  if (!parsed.success) {
    const errorMessage = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid client environment configuration: ${errorMessage}`);
  }

  return parsed.data;
};

const rawImportEnv = import.meta.env as unknown as Record<string, string | undefined>;

export const clientEnv = loadClientEnv(rawImportEnv);
