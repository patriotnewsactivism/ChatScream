/**
 * ChatScream Media Storage Abstraction
 *
 * Supports two backends:
 * 1. S3-compatible (AWS S3, Cloudflare R2, DigitalOcean Spaces, etc.)
 * 2. Local filesystem (fallback for development)
 *
 * Configuration via environment variables:
 *   S3_BUCKET        - Bucket name (enables S3 mode when set)
 *   S3_REGION        - AWS region or 'auto' for R2
 *   S3_ENDPOINT      - Custom endpoint URL (required for R2/Spaces)
 *   S3_ACCESS_KEY_ID - Access key
 *   S3_SECRET_ACCESS_KEY - Secret key
 *   S3_PUBLIC_URL    - Public URL prefix for serving files (optional)
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

const isS3Enabled = Boolean(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);

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
      config.forcePathStyle = true; // Required for R2 and most S3-compatible services
    }
    s3Client = new S3Client(config);
    console.log(`📦 S3 storage initialized (bucket: ${S3_BUCKET}, region: ${S3_REGION})`);
    return s3Client;
  } catch (error) {
    console.error('Failed to initialize S3 client:', error);
    return null;
  }
};

/**
 * Upload a file to storage.
 * @param {object} file - Multer file object {buffer, originalname, mimetype, filename, path}
 * @param {string} baseUrl - Server base URL for local fallback
 * @returns {Promise<{url: string, key: string, storage: 's3'|'local'}>}
 */
export const uploadFile = async (file, baseUrl = '') => {
  const ext = path.extname(file.originalname || '');
  const key = `media/${Date.now()}-${randomUUID()}${ext}`;

  const client = await getS3Client();
  if (client) {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      // Read file from disk if multer saved it there (diskStorage mode)
      let body;
      if (file.buffer) {
        body = file.buffer;
      } else if (file.path) {
        body = fs.readFileSync(file.path);
      }

      await client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: file.mimetype || 'application/octet-stream',
          CacheControl: 'public, max-age=31536000',
        }),
      );

      // Clean up local temp file if it exists
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      const publicUrl = S3_PUBLIC_URL
        ? `${S3_PUBLIC_URL.replace(//$/, '')}/${key}`
        : `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;

      return { url: publicUrl, key, storage: 's3' };
    } catch (error) {
      console.error('S3 upload failed, falling back to local:', error.message);
      // Fall through to local storage
    }
  }

  // Local storage fallback
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // If multer already saved the file (diskStorage), it's already in place
  const localFilename = file.filename || `${Date.now()}-${randomUUID()}${ext}`;
  if (!file.path || !fs.existsSync(file.path)) {
    const dest = path.join(uploadDir, localFilename);
    if (file.buffer) {
      fs.writeFileSync(dest, file.buffer);
    }
  }

  const url = `${baseUrl}/uploads/${file.filename || localFilename}`;
  return { url, key: localFilename, storage: 'local' };
};

/**
 * Delete a file from storage.
 * @param {string} key - The file key or filename
 * @returns {Promise<boolean>}
 */
export const deleteFile = async (key) => {
  const client = await getS3Client();
  if (client && key.startsWith('media/')) {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        }),
      );
      return true;
    } catch (error) {
      console.error('S3 delete failed:', error.message);
      return false;
    }
  }

  // Local deletion
  const localPath = path.join(process.cwd(), 'uploads', key);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
    return true;
  }
  return false;
};

/**
 * Get the current storage backend info.
 */
export const getStorageInfo = () => ({
  backend: isS3Enabled ? 's3' : 'local',
  bucket: isS3Enabled ? S3_BUCKET : null,
  region: isS3Enabled ? S3_REGION : null,
  warning: isS3Enabled
    ? null
    : 'Using local filesystem storage. Uploads will be lost on deploy/restart. Configure S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY for persistent storage.',
});

export default { uploadFile, deleteFile, getStorageInfo, isS3Enabled };
