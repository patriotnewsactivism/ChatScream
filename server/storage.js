/**
 * ChatScream Media Storage Abstraction
 *
 * Ordinary media uploads may fall back to local disk. Cloud recordings never
 * do: they require either S3-compatible object storage or an authenticated
 * HTTP object-storage gateway.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

const S3_BUCKET = String(process.env.S3_BUCKET || '').trim();
const S3_REGION = String(process.env.S3_REGION || 'us-east-1').trim();
const S3_ENDPOINT = String(process.env.S3_ENDPOINT || '').trim();
const S3_ACCESS_KEY_ID = String(process.env.S3_ACCESS_KEY_ID || '').trim();
const S3_SECRET_ACCESS_KEY = String(process.env.S3_SECRET_ACCESS_KEY || '').trim();
const S3_PUBLIC_URL = String(process.env.S3_PUBLIC_URL || '').trim();

const HTTP_STORAGE_URL = String(process.env.RECORDING_STORAGE_HTTP_URL || '').trim();
const HTTP_STORAGE_TOKEN = String(process.env.RECORDING_STORAGE_HTTP_TOKEN || '').trim();

export const isS3Enabled = Boolean(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);
export const isHttpRecordingStorageEnabled = Boolean(HTTP_STORAGE_URL && HTTP_STORAGE_TOKEN);
export const persistentRecordingStorageEnabled =
  isS3Enabled || isHttpRecordingStorageEnabled;

let s3Client = null;

const getS3Client = async () => {
  if (s3Client) return s3Client;
  if (!isS3Enabled) return null;

  try {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const config = {
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
    };
    if (S3_ENDPOINT) {
      config.endpoint = S3_ENDPOINT;
      config.forcePathStyle = true;
    }
    s3Client = new S3Client(config);
    console.log(`📦 S3 storage initialized (bucket: ${S3_BUCKET}, region: ${S3_REGION})`);
    return s3Client;
  } catch (error) {
    console.error('Failed to initialize S3 client:', error);
    return null;
  }
};

const publicUrlForKey = (key) =>
  S3_PUBLIC_URL
    ? `${S3_PUBLIC_URL.replace(/\/+$/, '')}/${key}`
    : `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;

const buildHttpStorageUrl = (key) => {
  const target = new URL(HTTP_STORAGE_URL);
  target.searchParams.set('key', key);
  return target.toString();
};

const httpStorageHeaders = (extra = {}) => ({
  authorization: `Bearer ${HTTP_STORAGE_TOKEN}`,
  ...extra,
});

export const uploadFile = async (file, baseUrl = '') => {
  const ext = path.extname(file.originalname || '');
  const key = `media/${Date.now()}-${randomUUID()}${ext}`;

  const client = await getS3Client();
  if (client) {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      let body;
      if (file.buffer) body = file.buffer;
      else if (file.path) body = fs.createReadStream(file.path);

      await client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: file.mimetype || 'application/octet-stream',
          CacheControl: 'public, max-age=31536000',
        }),
      );

      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return { url: publicUrlForKey(key), key, storage: 's3' };
    } catch (error) {
      console.error('S3 upload failed, falling back to local:', error.message);
    }
  }

  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const localFilename = file.filename || `${Date.now()}-${randomUUID()}${ext}`;
  if (!file.path || !fs.existsSync(file.path)) {
    const dest = path.join(uploadDir, localFilename);
    if (file.buffer) fs.writeFileSync(dest, file.buffer);
  }
  const url = `${baseUrl}/uploads/${file.filename || localFilename}`;
  return { url, key: localFilename, storage: 'local' };
};

/** Upload a completed relay archive without reading the whole video into RAM. */
export const uploadRecordingFile = async ({
  filePath,
  userId,
  recordingId,
  contentType = 'video/x-matroska',
}) => {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Recording file is missing.');

  const safeUser = String(userId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeId = String(recordingId || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const key = `recordings/${safeUser}/${safeId}.mkv`;
  const stat = fs.statSync(filePath);

  const client = await getS3Client();
  if (client) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentLength: stat.size,
        ContentType: contentType,
        ContentDisposition: `attachment; filename="chatscream-${safeId}.mkv"`,
        CacheControl: 'private, max-age=0, no-cache',
      }),
    );
    return {
      url: S3_PUBLIC_URL ? publicUrlForKey(key) : '',
      key,
      storage: 's3',
      sizeBytes: stat.size,
    };
  }

  if (isHttpRecordingStorageEnabled) {
    const response = await fetch(buildHttpStorageUrl(key), {
      method: 'PUT',
      headers: httpStorageHeaders({
        'content-type': contentType,
        'content-length': String(stat.size),
        'content-disposition': `attachment; filename="chatscream-${safeId}.mkv"`,
      }),
      body: fs.createReadStream(filePath),
      duplex: 'half',
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Recording storage upload failed: ${response.status} ${detail}`.trim());
    }
    const data = await response.json().catch(() => ({}));
    return {
      url: String(data.url || ''),
      key: String(data.key || key),
      storage: 'http',
      sizeBytes: Number(data.sizeBytes || stat.size),
    };
  }

  throw new Error('Persistent cloud object storage is not configured.');
};

/** Fetch a private recording object for authenticated relay download streaming. */
export const getRecordingObject = async (key) => {
  if (!String(key || '').startsWith('recordings/')) throw new Error('Invalid recording key.');

  const client = await getS3Client();
  if (client) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    return client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  }

  if (isHttpRecordingStorageEnabled) {
    const response = await fetch(buildHttpStorageUrl(key), {
      headers: httpStorageHeaders(),
    });
    if (!response.ok || !response.body) throw new Error('Recording object unavailable.');
    return {
      ContentType: response.headers.get('content-type') || 'video/x-matroska',
      ContentLength: Number(response.headers.get('content-length') || 0) || undefined,
      ContentDisposition:
        response.headers.get('content-disposition') ||
        'attachment; filename="chatscream-recording.mkv"',
      Body: Readable.fromWeb(response.body),
    };
  }

  throw new Error('Persistent cloud object storage is not configured.');
};

export const deleteFile = async (key) => {
  const client = await getS3Client();
  if (client && (key.startsWith('media/') || key.startsWith('recordings/'))) {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      return true;
    } catch (error) {
      console.error('S3 delete failed:', error.message);
      return false;
    }
  }

  if (isHttpRecordingStorageEnabled && key.startsWith('recordings/')) {
    try {
      const response = await fetch(buildHttpStorageUrl(key), {
        method: 'DELETE',
        headers: httpStorageHeaders(),
      });
      return response.ok || response.status === 404;
    } catch (error) {
      console.error('HTTP storage delete failed:', error.message);
      return false;
    }
  }

  const localPath = path.join(process.cwd(), 'uploads', key);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
    return true;
  }
  return false;
};

export const testRecordingStorage = async () => {
  if (!persistentRecordingStorageEnabled) {
    throw new Error('Persistent cloud object storage is not configured.');
  }

  const key = `recordings/_selftest/${Date.now()}-${randomUUID()}.txt`;
  const payload = Buffer.from('chatscream-storage-selftest');

  if (isS3Enabled) {
    const client = await getS3Client();
    const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import(
      '@aws-sdk/client-s3'
    );
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: payload,
          ContentType: 'text/plain',
        }),
      );
      const fetched = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      const body = fetched.Body?.transformToString
        ? await fetched.Body.transformToString()
        : '';
      if (body !== payload.toString()) throw new Error('Storage read-back verification failed.');
      return { ok: true, backend: 's3' };
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })).catch(() => {});
    }
  }

  const target = buildHttpStorageUrl(key);
  const put = await fetch(target, {
    method: 'PUT',
    headers: httpStorageHeaders({
      'content-type': 'text/plain',
      'content-length': String(payload.length),
    }),
    body: payload,
  });
  if (!put.ok) throw new Error(`Storage write test failed (${put.status}).`);
  try {
    const get = await fetch(target, { headers: httpStorageHeaders() });
    if (!get.ok || (await get.text()) !== payload.toString()) {
      throw new Error('Storage read-back verification failed.');
    }
    return { ok: true, backend: 'http' };
  } finally {
    await fetch(target, { method: 'DELETE', headers: httpStorageHeaders() }).catch(() => {});
  }
};

export const getStorageInfo = () => ({
  backend: isS3Enabled ? 's3' : isHttpRecordingStorageEnabled ? 'http' : 'local',
  bucket: isS3Enabled ? S3_BUCKET : null,
  region: isS3Enabled ? S3_REGION : null,
  persistentRecordings: persistentRecordingStorageEnabled,
  warning: persistentRecordingStorageEnabled
    ? null
    : 'Using local filesystem storage. Persistent cloud recordings require S3-compatible storage or an authenticated recording-storage gateway.',
});

export default {
  uploadFile,
  uploadRecordingFile,
  getRecordingObject,
  deleteFile,
  testRecordingStorage,
  getStorageInfo,
  isS3Enabled,
  isHttpRecordingStorageEnabled,
  persistentRecordingStorageEnabled,
};
