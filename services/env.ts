import { z } from 'zod';

const clientEnvSchema = z.object({
  VITE_CLAUDE_API_KEY: z.string().min(1).optional(),
  VITE_GEMINI_API_KEY: z.string().min(1).optional(),
  VITE_SENTRY_DSN: z.string().min(1).optional(),
});

const normalizeEnvValue = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export const loadClientEnv = (env: Record<string, string | undefined>) => {
  const parsed = clientEnvSchema.safeParse({
    VITE_CLAUDE_API_KEY: normalizeEnvValue(env.VITE_CLAUDE_API_KEY),
    VITE_GEMINI_API_KEY: normalizeEnvValue(env.VITE_GEMINI_API_KEY),
    VITE_SENTRY_DSN: normalizeEnvValue(env.VITE_SENTRY_DSN),
  });

  if (!parsed.success) {
    const errorMessage = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid client environment configuration: ${errorMessage}`);
  }

  return parsed.data;
};

export const clientEnv = loadClientEnv(import.meta.env as unknown as Record<string, string | undefined>);
