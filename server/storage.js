/**
 * ChatScream Media Storage Abstraction
 *
 * Supports S3-compatible object storage (AWS S3, Cloudflare R2, Spaces, etc.)
 * with a local fallback for ordinary media uploads. Cloud recordings never
 * silently fall back to ephemeral disk: if object storage is unavailable the
 * relay reports cloud recording as unavailable and the local master remains.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const S3_BUCKET = String(process.env.S3_BUCKET || '').trim();
const S3_REGION = String(process.env.S3_REGION || 'us-east-1').trim();
const S3_ENDPOINT = String(process.env.S3_ENDPOINT || '').trim();
const S3_ACCESS_KEY_ID = String(process.env.S3_ACCESS_KEY_ID || '').trim();
const S3_SECRET_ACCESS_KEY = String(process.env.S3_SECRET_ACCESS_KEY || '').trim();
const S3_PUBLIC_URL = String(process.env.S3_PUBLIC_URL || '').trim();

export const isS3Enabled = Boolean(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);

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
export const uploadRecordingFile = async ({ filePath, userId, recordingId, contentType = 'video/x-matroska' }) => {
  const client = await getS3Client();
  if (!client) throw new Error('Persistent cloud object storage is not configured.');
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Recording file is missing.');

  const safeUser = String(userId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeId = String(recordingId || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const key = `recordings/${safeUser}/${safeId}.mkv`;
  const stat = fs.statSync(filePath);
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
};

/** Fetch a private recording object for authenticated relay download streaming. */
export const getRecordingObject = async (key) => {
  const client = await getS3Client();
  if (!client) throw new Error('Persistent cloud object storage is not configured.');
  if (!String(key || '').startsWith('recordings/')) throw new Error('Invalid recording key.');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  return client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
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

  const localPath = path.join(process.cwd(), 'uploads', key);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
    return true;
  }
  return false;
};

export const getStorageInfo = () => ({
  backend: isS3Enabled ? 's3' : 'local',
  bucket: isS3Enabled ? S3_BUCKET : null,
  region: isS3Enabled ? S3_REGION : null,
  persistentRecordings: isS3Enabled,
  warning: isS3Enabled
    ? null
    : 'Using local filesystem storage. Persistent cloud recordings require S3-compatible object storage.',
});

export default {
  uploadFile,
  uploadRecordingFile,
  getRecordingObject,
  deleteFile,
  getStorageInfo,
  isS3Enabled,
};
