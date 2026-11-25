/**
 * Authenticated status callback from a Cloud Run Jobs URL-to-Live worker.
 *
 * The worker posts its lifecycle to POST /api/cloud-v2/jobs/:jobId/status
 * with a per-job Bearer token (see server/commercial/cloudProvider.js).
 * The token is verified against the SHA-256 hash stored on the durable
 * cloud session — the raw token is never persisted — so a caller who does
 * not hold the per-job token cannot forge a status or end someone elses
 * session.
 *
 * This runs outside the normal Express route table (see
 * server/entrypoint.js): the callback carries a worker credential, not a
 * user session, so it must bypass the requireAuth gate on /api/cloud-v2.
 * The pattern matches the YouTube destination OAuth interceptor in
 * server/youtubeDestinationOAuthCallback.js.
 *
 * Terminal statuses end the durable cloud session so billing stops and
 * the usage ledger is closed. Non-terminal statuses only update the
 * worker state. Polling reconciliation in server/commercial/router.js
 * covers a missed callback.
 */
import {
  endDurableCloudSession,
  findUserByActiveCloudSession,
  updateActiveCloudSessionWorker,
} from "./cloudUsage.js";
import { verifyCallbackToken } from "./cloudProvider.js";

const CALLBACK_PATH = /^\/api\/cloud-v2\/jobs\/([^/]+)\/status$/;
const CALLBACK_STATUSES = new Set(["running", "completed", "failed", "stopped", "timed_out"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "stopped", "timed_out"]);
const MAX_BODY_BYTES = 64 * 1024;

const sendJson = (res, status, body) => {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

const readBearerToken = (req) => {
  const header = String(req.headers?.authorization || "");
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : "";
};

// The callback is intercepted before Express middleware runs, so the JSON
// body has not been parsed yet. Read it from the raw request stream.
const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Callback body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Callback body is not valid JSON."));
      }
    });
    req.on("error", reject);
  });

const handleCloudJobCallback = async (req, res, jobId) => {
  try {
    const body = await readJsonBody(req);
    const presented = readBearerToken(req);
    if (!presented) {
      sendJson(res, 401, { success: false, message: "Missing callback token." });
      return;
    }
    const owner = await findUserByActiveCloudSession(jobId);
    if (!owner) {
      sendJson(res, 404, { success: false, message: "Cloud session not found." });
      return;
    }
    const storedHash = owner.usage?.activeCloudSession?.worker?.callbackTokenHash;
    if (!storedHash || !verifyCallbackToken(presented, storedHash)) {
      sendJson(res, 401, { success: false, message: "Invalid callback token." });
      return;
    }
    const status = String(body?.status || "").toLowerCase();
    if (!CALLBACK_STATUSES.has(status)) {
      sendJson(res, 400, { success: false, message: "Invalid callback status." });
      return;
    }
    const endedAt =
      body?.at || (TERMINAL_STATUSES.has(status) ? new Date().toISOString() : undefined);
    await updateActiveCloudSessionWorker({ uid: owner.uid, sessionId: jobId, state: status, endedAt });
    if (TERMINAL_STATUSES.has(status)) {
      await endDurableCloudSession({ uid: owner.uid, sessionId: jobId, endedAt });
    }
    sendJson(res, 200, { success: true, status });
  } catch (error) {
    sendJson(res, 500, { success: false, message: "Cloud job callback failed." });
    console.error("Cloud job callback failed:", error?.message || error);
  }
};

export const maybeHandleCloudJobCallback = (req, res) => {
  let pathname = "";
  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return false;
  }
  const match = CALLBACK_PATH.exec(pathname);
  if (!match || req.method !== "POST") return false;
  // Kick off the async handler; it owns the response. Returning true keeps
  // the normal Express route table (and its requireAuth gate) from seeing
  // this request.
  handleCloudJobCallback(req, res, decodeURIComponent(match[1])).catch((error) => {
    sendJson(res, 500, { success: false, message: "Cloud job callback failed." });
    console.error("Cloud job callback failed:", error?.message || error);
  });
  return true;
};
