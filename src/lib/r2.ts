import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { serverEnv } from '@/lib/env';

let client: S3Client | undefined;
export function r2() {
  if (!client) {
    const env = serverEnv();
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    });
  }
  return client;
}
const bucket = () => serverEnv().R2_BUCKET;

/** Short-lived upload URL. Content-Type and Content-Length are part of the signature. */
export function presignPut(a: { key: string; contentType: string; sizeBytes: number; expiresIn?: number }) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: a.key, ContentType: a.contentType, ContentLength: a.sizeBytes }),
    { expiresIn: a.expiresIn ?? 900, signableHeaders: new Set(['content-type', 'content-length']) },
  );
}

export function presignGet(a: { key: string; expiresIn: number; disposition?: 'inline' | 'attachment'; filename?: string }) {
  const name = a.filename ? `; filename="${a.filename.replace(/[^\w.\- ]/g, '_')}"` : '';
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: a.key,
      ResponseContentDisposition: `${a.disposition ?? 'inline'}${name}`,
      ResponseCacheControl: 'private, no-store',
    }),
    { expiresIn: a.expiresIn },
  );
}

export async function headObject(key: string) {
  const r = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType ?? '' };
}

export async function readHead(key: string, bytes = 32): Promise<Uint8Array> {
  const r = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }));
  return (await r.Body?.transformToByteArray()) ?? new Uint8Array();
}

export async function deleteObject(key: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
