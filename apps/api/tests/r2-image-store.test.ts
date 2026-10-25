import { expect, it } from 'vitest';
import {
  R2ImageStore,
  configuredImageStore,
} from '../src/catalogue/image-store';

const options = {
  accountId: 'a'.repeat(32),
  accessKeyId: 'synthetic-id',
  secretAccessKey: 'synthetic-secret',
  uploadBucket: 'auction-test-incoming',
  publicBucket: 'auction-test-photos',
  publicUrl: 'https://photos.example.test',
};
it('signs a short-lived PUT bound to key, checksum, content type and length without a network call', async () => {
  const store = new R2ImageStore(options);
  const url = new URL(
    await store.presign(
      'incoming/test/photo',
      'image/jpeg',
      1024,
      'b'.repeat(64),
      300,
    ),
  );
  expect(url.origin).toBe(
    `https://${options.uploadBucket}.${options.accountId}.r2.cloudflarestorage.com`,
  );
  expect(url.pathname).toContain('incoming/test/photo');
  expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  const headers = url.searchParams.get('X-Amz-SignedHeaders');
  for (const header of ['content-length', 'content-type', 'x-amz-meta-sha256'])
    expect(headers).toContain(header);
});
it('rejects public incoming buckets, malformed account/bucket names and unsafe CDN origins', () => {
  for (const override of [
    { publicBucket: options.uploadBucket },
    { publicUrl: 'http://photos.example.test' },
    { publicUrl: 'https://user:pass@photos.example.test' },
    { publicUrl: 'https://photos.example.test/path' },
    { accountId: 'bad' },
    { uploadBucket: 'bad/bucket' },
  ])
    expect(() => new R2ImageStore({ ...options, ...override })).toThrow();
});
it('disables uploads without an R2 account and rejects partial configuration', () => {
  const account = process.env.R2_ACCOUNT_ID;
  try {
    delete process.env.R2_ACCOUNT_ID;
    expect(configuredImageStore()).toBeUndefined();
    process.env.R2_ACCOUNT_ID = 'a'.repeat(32);
    expect(() => configuredImageStore()).toThrow();
  } finally {
    if (account === undefined) delete process.env.R2_ACCOUNT_ID;
    else process.env.R2_ACCOUNT_ID = account;
  }
});
