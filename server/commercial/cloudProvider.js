/**
 * Cloud broadcast worker provider.
 *
 * Two backends behind one interface. Cloud Run Jobs is the primary
 * provider: a Cloud Run Job execution is the per-broadcast sandbox and the
 * backend starts one with per-execution environment overrides (see
 * server/commercial/cloudRunWorker.js and infrastructure/gcp/url-worker/).
 * The legacy AWS external orchestrator (server/commercial/cloudWorker.js)
 * is kept as a fallback while CLOUD_WORKER_API_URL/CLOUD_WORKER_API_TOKEN
 * are configured. When neither provider is configured every cloud start
 * fails closed (503) and no usage is charged.
 *
 * The provider also owns the per-job callback token: a random token is
 * generated per Cloud Run execution and handed to the worker via its
 * environment. Only the SHA-256 hash is ever persisted (see
 * server/commercial/cloudJobCallback.js); the raw token is never stored,
 * logged, or returned to the client.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  getJob as getCloudRunJob,
  health as cloudRunHealth,
  isCloudRunWorkerConfigured,
  startJob as startCloudRunJob,
  stopJob as stopCloudRunJob,
} from "./cloudRunWorker.js";
import {
  getCloudWorkerHealth as getExternalHealth,
  getCloudWorkerJob as getExternalJob,
  isCloudWorkerConfigured as isExternalConfigured,
  startCloudWorkerJob as startExternalJob,
  stopCloudWorkerJob as stopExternalJob,
} from "./cloudWorker.js";

export const CLOUD_PROVIDER_CLOUD_RUN = "cloud-run";
export const CLOUD_PROVIDER_EXTERNAL = "external";

export const resolveCloudProvider = () => {
  if (isCloudRunWorkerConfigured()) return CLOUD_PROVIDER_CLOUD_RUN;
  if (isExternalConfigured()) return CLOUD_PROVIDER_EXTERNAL;
  return null;
};

export const isCloudWorkerConfigured = () => resolveCloudProvider() !== null;

export const hashCallbackToken = (token) =>
  createHash("sha256").update(String(token || "")).digest("hex");

export const verifyCallbackToken = (presented, storedHash) => {
  try {
    const a = Buffer.from(hashCallbackToken(presented), "utf8");
    const b = Buffer.from(String(storedHash || ""), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

export const getCloudWorkerHealth = async () => {
  const provider = resolveCloudProvider();
  if (provider === CLOUD_PROVIDER_CLOUD_RUN) {
    const result = await cloudRunHealth();
    return { ...result, provider };
  }
  if (provider === CLOUD_PROVIDER_EXTERNAL) {
    const result = await getExternalHealth();
    return { ...result, provider };
  }
  return { configured: false, healthy: false, provider: null };
};

/**
 * Start a cloud broadcast worker for a session. Returns a normalized
 * worker record. For Cloud Run the record carries the execution id and the
 * SHA-256 hash of the per-job callback token (never the raw token).
 */
export const startCloudWorkerJob = async (input) => {
  const provider = resolveCloudProvider();
  if (provider === CLOUD_PROVIDER_CLOUD_RUN) {
    const callbackToken = randomBytes(32).toString("hex");
    const callbackTokenHash = hashCallbackToken(callbackToken);
    const started = await startCloudRunJob({
      jobId: input.sessionId,
      payload: {
        sessionId: input.sessionId,
        userId: input.userId,
        source: input.source,
        destinations: input.destinations,
        output: {
          quality: input.quality,
          bitrateKbps: input.bitrateKbps,
          rateControl: "cbr",
        },
        limits: {
          maxDurationSeconds: input.maxDurationSeconds,
          blockPrivateNetworks: true,
          revalidateDnsBeforeFetch: true,
        },
        recording: input.recording,
      },
      callbackToken,
    });
    return {
      provider: CLOUD_PROVIDER_CLOUD_RUN,
      workerId: started.executionId,
      jobId: input.sessionId,
      executionId: started.executionId,
      executionName: started.executionName,
      state: "starting",
      startedAt: new Date().toISOString(),
      callbackTokenHash,
    };
  }
  if (provider === CLOUD_PROVIDER_EXTERNAL) {
    const started = await startExternalJob(input);
    return { ...started, provider: CLOUD_PROVIDER_EXTERNAL };
  }
  throw new Error("Cloud worker capacity is not provisioned yet. No usage has been charged.");
};

/**
 * Fetch the current state of a cloud worker. Accepts the session jobId and,
 * for Cloud Run, the execution id (the stable handle for the Run API).
 * Returns a normalized { provider, workerId, jobId, executionId, state,
 * startedAt, endedAt } record, or null when the worker cannot be found.
 */
export const getCloudWorkerJob = async ({ jobId, executionId }) => {
  const provider = resolveCloudProvider();
  if (provider === CLOUD_PROVIDER_CLOUD_RUN) {
    if (!executionId) return null;
    const job = await getCloudRunJob(executionId);
    if (!job) return null;
    return {
      provider: CLOUD_PROVIDER_CLOUD_RUN,
      workerId: job.executionId,
      jobId: jobId || job.executionId,
      executionId: job.executionId,
      state: job.status,
      startedAt: job.startedAt || null,
      endedAt: job.endedAt || null,
    };
  }
  if (provider === CLOUD_PROVIDER_EXTERNAL) {
    const job = await getExternalJob(jobId);
    return job ? { ...job, provider: CLOUD_PROVIDER_EXTERNAL } : null;
  }
  return null;
};

export const stopCloudWorkerJob = async ({ jobId, sessionId, executionId }) => {
  const provider = resolveCloudProvider();
  if (provider === CLOUD_PROVIDER_CLOUD_RUN) {
    if (!executionId) return { stopped: false, reason: "no executionId" };
    await stopCloudRunJob(executionId);
    return { stopped: true, executionId };
  }
  if (provider === CLOUD_PROVIDER_EXTERNAL) {
    return stopExternalJob({ jobId, sessionId });
  }
  return { stopped: false, reason: "unconfigured" };
};
