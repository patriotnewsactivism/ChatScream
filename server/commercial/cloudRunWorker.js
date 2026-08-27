/**
 * Cloud Run Jobs backend for URL-to-Live broadcasts.
 *
 * The AWS path (cloudWorker.js) calls a bespoke orchestrator service that
 * launches an EC2 instance per job. On GCP there is nothing to orchestrate:
 * a Cloud Run Job execution *is* the per-job sandbox, and the Admin API can
 * start one with per-execution environment overrides. So this module talks to
 * Google's API directly and there is no second service to deploy or secure.
 *
 * Auth uses Application Default Credentials — on Cloud Run that is the service
 * account already attached to the backend, so no key material is stored.
 */

const PROJECT = () => String(process.env.GCP_PROJECT_ID || '').trim();
const REGION = () => String(process.env.CLOUD_RUN_JOB_REGION || 'us-central1').trim();
const JOB_NAME = () => String(process.env.CLOUD_RUN_JOB_NAME || 'chatscream-url-worker').trim();
const CALLBACK_URL = () => String(process.env.CLOUD_WORKER_CALLBACK_URL || '').trim();

const RUN_API = 'https://run.googleapis.com/v2';
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

export const isCloudRunWorkerConfigured = () => Boolean(PROJECT() && JOB_NAME());

const notConfigured = () => {
  const error = new Error('Cloud Run job execution is not configured.');
  error.code = 'CLOUD_WORKER_NOT_CONFIGURED';
  return error;
};

/**
 * Access token for the runtime service account.
 *
 * GOOGLE_ACCESS_TOKEN is honoured first so this can be exercised locally and in
 * tests without reaching the metadata server, which only exists on GCP.
 */
const accessToken = async () => {
  const injected = String(process.env.GOOGLE_ACCESS_TOKEN || '').trim();
  if (injected) return injected;

  const response = await fetch(METADATA_TOKEN_URL, {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Could not obtain a GCP access token (${response.status}).`);
  }
  const payload = await response.json();
  const token = String(payload?.access_token || '').trim();
  if (!token) throw new Error('GCP token response contained no access_token.');
  return token;
};

const runApi = async (path, options = {}) => {
  if (!isCloudRunWorkerConfigured()) throw notConfigured();

  const response = await fetch(`${RUN_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await accessToken()}`,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 1000) };
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || `Cloud Run request failed (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return payload;
};

const jobPath = () => `/projects/${PROJECT()}/locations/${REGION()}/jobs/${JOB_NAME()}`;

/**
 * Cloud Run caps a task at 24h; the control plane's own limit must fit inside
 * it or the task would be killed with no chance to report a final status.
 */
const TASK_CEILING_SECONDS = 86400;

export const startJob = async ({ jobId, payload, callbackToken }) => {
  if (!jobId) throw new Error('jobId is required.');
  if (!callbackToken) throw new Error('callbackToken is required.');

  const maxDuration = Math.max(
    60,
    Math.min(43200, Number(payload?.limits?.maxDurationSeconds) || 3600),
  );

  const execution = await runApi(`${jobPath()}:run`, {
    method: 'POST',
    body: JSON.stringify({
      overrides: {
        // A generous margin over maxDuration so the worker always wins the race
        // and gets to post its own terminal status before Cloud Run intervenes.
        taskTimeout: `${Math.min(TASK_CEILING_SECONDS, maxDuration + 300)}s`,
        containerOverrides: [
          {
            env: [
              { name: 'CHATSCREAM_JOB_ID', value: String(jobId) },
              { name: 'CHATSCREAM_JOB_PAYLOAD', value: JSON.stringify(payload) },
              { name: 'CHATSCREAM_CALLBACK_URL', value: CALLBACK_URL() },
              { name: 'CHATSCREAM_CALLBACK_TOKEN', value: String(callbackToken) },
            ],
          },
        ],
      },
    }),
  });

  // `name` is the long-form operation/execution path; the last segment is the id.
  const executionName = String(execution?.metadata?.name || execution?.name || '');
  return {
    jobId,
    executionName,
    executionId: executionName.split('/').pop() || '',
    status: 'starting',
  };
};

const EXECUTION_STATE = {
  ACTIVE: 'running',
  SUCCEEDED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'stopped',
  ABANDONED: 'failed',
};

export const getJob = async (executionId) => {
  if (!executionId) throw new Error('executionId is required.');
  const execution = await runApi(
    `/projects/${PROJECT()}/locations/${REGION()}/jobs/${JOB_NAME()}/executions/${executionId}`,
  );

  // Cloud Run reports progress as counters rather than a single state field.
  const running = Number(execution?.runningCount || 0);
  const succeeded = Number(execution?.succeededCount || 0);
  const failed = Number(execution?.failedCount || 0);
  const cancelled = Number(execution?.cancelledCount || 0);

  let status = 'starting';
  if (running > 0) status = EXECUTION_STATE.ACTIVE;
  else if (succeeded > 0) status = EXECUTION_STATE.SUCCEEDED;
  else if (cancelled > 0) status = EXECUTION_STATE.CANCELLED;
  else if (failed > 0) status = EXECUTION_STATE.FAILED;

  return {
    executionId,
    status,
    startedAt: execution?.startTime || null,
    endedAt: execution?.completionTime || null,
  };
};

export const stopJob = async (executionId) => {
  if (!executionId) throw new Error('executionId is required.');
  await runApi(
    `/projects/${PROJECT()}/locations/${REGION()}/jobs/${JOB_NAME()}/executions/${executionId}:cancel`,
    { method: 'POST', body: '{}' },
  );
  return { executionId, status: 'stopping' };
};

export const health = async () => {
  if (!isCloudRunWorkerConfigured()) return { configured: false, healthy: false };
  try {
    await runApi(jobPath());
    return { configured: true, healthy: true };
  } catch (error) {
    return { configured: true, healthy: false, error: error.message };
  }
};
