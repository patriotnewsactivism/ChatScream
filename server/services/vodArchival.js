import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

export class VODArchivalService {
  constructor(config = {}) {
    this.provider = config.provider || process.env.VOD_STORAGE_PROVIDER || 's3'; // 's3' or 'r2'
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.bucketName = config.bucket || process.env.VOD_S3_BUCKET || 'chatscream-vods';

    const s3Options = {
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '',
      },
    };

    if (this.provider === 'r2' && process.env.R2_ACCOUNT_ID) {
      s3Options.endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    }

    this.client = new S3Client(s3Options);
  }

  async archiveStreamVOD(streamId, filePath, metadata = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`VOD file not found at ${filePath}`);
    }

    const fileStat = fs.statSync(filePath);
    if (fileStat.size === 0) {
      throw new Error('VOD file is empty');
    }

    const key = `recordings/${streamId}/${path.basename(filePath)}`;
    const fileStream = fs.createReadStream(filePath);

    const uploadCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: fileStream,
      ContentType: 'video/mp4',
      ContentLength: fileStat.size,
      Metadata: {
        streamId,
        archivedAt: new Date().toISOString(),
        ...metadata,
      },
    });

    await this.client.send(uploadCommand);

    const publicUrl = process.env.VOD_PUBLIC_CDN_URL
      ? `${process.env.VOD_PUBLIC_CDN_URL.replace(/\/+$/, '')}/${key}`
      : `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

    return {
      success: true,
      key,
      bucket: this.bucketName,
      publicUrl,
      sizeBytes: fileStat.size,
      streamId,
    };
  }

  async checkVODStatus(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const res = await this.client.send(command);
      return {
        exists: true,
        contentLength: res.ContentLength,
        lastModified: res.LastModified,
        metadata: res.Metadata,
      };
    } catch (err) {
      if (err.name === 'NotFound') {
        return { exists: false };
      }
      throw err;
    }
  }
}

export const vodArchivalService = new VODArchivalService();
