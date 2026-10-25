import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { imageRules } from '@auction-ng/shared';

export interface ImageStore {
  presign(
    key: string,
    contentType: string,
    size: number,
    sha256: string,
    expiresIn: number,
  ): Promise<string>;
  read(key: string): Promise<Buffer>;
  write(key: string, body: Buffer): Promise<string>;
}
export interface R2Options {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  uploadBucket: string;
  publicBucket: string;
  publicUrl: string;
}
export class R2ImageStore implements ImageStore {
  private readonly client: S3Client;
  private readonly origin: string;
  constructor(private readonly options: R2Options) {
    const url = new URL(options.publicUrl);
    if (
      !/^[a-f0-9]{32}$/.test(options.accountId) ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      options.uploadBucket === options.publicBucket ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(options.uploadBucket) ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(options.publicBucket)
    )
      throw new Error(
        'Configure separate private/public R2 buckets and an HTTPS CDN origin.',
      );
    this.origin = url.origin;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  async presign(
    key: string,
    contentType: string,
    size: number,
    sha256: string,
    expiresIn: number,
  ) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.uploadBucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
        // R2 does not support full-object SHA256 checksum mode. Bind the
        // accepted digest as signed metadata; completion hashes the bytes.
        Metadata: { sha256 },
      }),
      {
        expiresIn,
        signableHeaders: new Set(['content-type', 'content-length']),
        unhoistableHeaders: new Set(['x-amz-meta-sha256']),
      },
    );
  }
  async read(key: string) {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.uploadBucket, Key: key }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    if (
      !object.Body ||
      !object.ContentLength ||
      object.ContentLength > imageRules.maxUploadBytes
    )
      throw new Error('Invalid upload size.');
    const bytes = await object.Body.transformToByteArray();
    if (bytes.length > imageRules.maxUploadBytes)
      throw new Error('Invalid upload size.');
    return Buffer.from(bytes);
  }
  async write(key: string, body: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.publicBucket,
        Key: key,
        Body: body,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    return `${this.origin}/${key}`;
  }
}
export function configuredImageStore(): ImageStore | undefined {
  if (!process.env.R2_ACCOUNT_ID) return undefined;
  const names = [
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_UPLOAD_BUCKET',
    'R2_PUBLIC_BUCKET',
    'R2_PUBLIC_URL',
  ] as const;
  if (names.some((name) => !process.env[name]))
    throw new Error('Complete all R2 image settings.');
  return new R2ImageStore({
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    uploadBucket: process.env.R2_UPLOAD_BUCKET ?? '',
    publicBucket: process.env.R2_PUBLIC_BUCKET ?? '',
    publicUrl: process.env.R2_PUBLIC_URL ?? '',
  });
}
