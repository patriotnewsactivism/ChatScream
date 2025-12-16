"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.functionsEnv = exports.loadFunctionsEnv = void 0;
const zod_1 = require("zod");
const functionsEnvSchema = zod_1.z.object({
    STRIPE_SECRET_KEY: zod_1.z.string().min(1, 'STRIPE_SECRET_KEY is required'),
    STRIPE_WEBHOOK_SECRET: zod_1.z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
    YOUTUBE_CLIENT_ID: zod_1.z.string().min(1).optional(),
    YOUTUBE_CLIENT_SECRET: zod_1.z.string().min(1).optional(),
    FACEBOOK_APP_ID: zod_1.z.string().min(1).optional(),
    FACEBOOK_APP_SECRET: zod_1.z.string().min(1).optional(),
    TWITCH_CLIENT_ID: zod_1.z.string().min(1).optional(),
    TWITCH_CLIENT_SECRET: zod_1.z.string().min(1).optional(),
    CLAUDE_API_KEY: zod_1.z.string().min(1).optional(),
});
const normalizeSecret = (value) => {
    if (!value)
        return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
};
const loadFunctionsEnv = (env) => {
    var _a, _b;
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
        const issues = ((_b = (_a = parsed.error) === null || _a === void 0 ? void 0 : _a.issues) === null || _b === void 0 ? void 0 : _b.map((issue) => `${issue.path.join('.')}: ${issue.message}`)) || [];
        const errorMessage = issues.length ? issues.join('; ') : 'Unknown environment validation error';
        throw new Error(`Invalid Cloud Functions environment: ${errorMessage}`);
    }
    return parsed.data;
};
exports.loadFunctionsEnv = loadFunctionsEnv;
exports.functionsEnv = (0, exports.loadFunctionsEnv)(process.env);
//# sourceMappingURL=config.js.map