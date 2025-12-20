import { z } from 'zod';

const clientEnvSchema = z.object({
  VITE_GEMINI_API_KEY: z.string().min(1).optional(),
  VITE_SENTRY_DSN: z.string().min(1).optional(),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
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
    VITE_FIREBASE_PROJECT_ID: normalizeEnvValue(env.VITE_FIREBASE_PROJECT_ID),
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
const resolvedProjectId =
  normalizeEnvValue(rawImportEnv?.VITE_FIREBASE_PROJECT_ID) ||
  normalizeEnvValue(process.env.VITE_FIREBASE_PROJECT_ID);

const hydratedEnv = {
  ...rawImportEnv,
  VITE_FIREBASE_PROJECT_ID:
    resolvedProjectId || (rawImportEnv?.MODE === 'test' ? 'test-project' : undefined),
};

export const clientEnv = loadClientEnv(hydratedEnv);
