const baseUrl = () => String(process.env.CLOUD_WORKER_API_URL || '').trim().replace(/\/+$/, '');
const apiToken = () => String(process.env.CLOUD_WORKER_API_TOKEN || '').trim();

export const isCloudWorkerConfigured = () => Boolean(baseUrl() && apiToken());

const request = async (path, options = {}) => {
  if (!isCloudWorkerConfigured()) {
    const error = new Error('Cloud worker orchestration is not configured.');
    error.code = 'CLOUD_WORKER_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken()}`,
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
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload?.message || payload?.error || `Cloud worker request failed (${response.status}).`,
    );
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
};

export const getCloudWorkerHealth = async () => {
  if (!isCloudWorkerConfigured()) {
    return { configured: false, healthy: false };
  }
  try {
    const payload = await request('/health', { method: 'GET' });
    return { configured: true, healthy: payload?.ok !== false, ...payload };
  } catch (error) {
    return {
      configured: true,
      healthy: false,
      error: error?.message || 'Cloud worker health check failed.',
    };
  }
};

export const startCloudWorkerJob = async ({
  sessionId,
  userId,
  source,
  destinations,
  quality,
  bitrateKbps,
  recording,
}) => {
  const payload = await request('/v1/jobs', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      userId,
      source,
      destinations,
      output: {
        quality,
        bitrateKbps,
        rateControl: 'cbr',
      },
      recording: recording || { enabled: true },
    }),
  });

  return {
    provider: String(payload.provider || 'external'),
    workerId: String(payload.workerId || payload.jobId || ''),
    jobId: String(payload.jobId || payload.workerId || sessionId),
    state: String(payload.state || 'starting'),
    ingestUrl: payload.ingestUrl || null,
    startedAt: payload.startedAt || new Date().toISOString(),
    raw: payload,
  };
};

export const stopCloudWorkerJob = async ({ jobId, sessionId }) => {
  const id = encodeURIComponent(String(jobId || sessionId || '').trim());
  if (!id) throw new Error('Cloud worker job id is required.');
  return request(`/v1/jobs/${id}/stop`, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
};

export const getCloudWorkerJob = async (jobId) => {
  const id = encodeURIComponent(String(jobId || '').trim());
  if (!id) throw new Error('Cloud worker job id is required.');
  return request(`/v1/jobs/${id}`, { method: 'GET' });
};
