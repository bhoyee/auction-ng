import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configuredImageStore } from '../src/catalogue/image-store';
import { LocalImageStore } from '../src/catalogue/local-image-store';

const ORIGIN = 'http://localhost:3301';
let dir: string;
let server: Server;
let base: string;
let store: LocalImageStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'lv-images-'));
  server = createServer((req, res) =>
    store.handler([ORIGIN])(req, res, () => {
      res.statusCode = 418;
      res.end();
    }),
  );
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  store = new LocalImageStore(dir, base);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise((done) => server.close(done));
  await rm(dir, { recursive: true, force: true });
});

const photo = Buffer.from('synthetic photo bytes');
const sha = createHash('sha256').update(photo).digest('hex');
const put = (url: string, body = photo, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': 'image/webp',
      'x-amz-meta-sha256': sha,
      Origin: ORIGIN,
      ...headers,
    },
  });

it('accepts the signed upload once, then reads back exactly those bytes', async () => {
  const url = await store.presign(
    'incoming/lot/photo',
    'image/webp',
    photo.length,
    sha,
    300,
  );
  const res = await put(url);
  expect(res.status).toBe(200);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  expect(await store.read('incoming/lot/photo')).toEqual(photo);
});

it('refuses a changed signature, expired link, wrong checksum or wrong type', async () => {
  const url = await store.presign(
    'incoming/lot/photo',
    'image/webp',
    photo.length,
    sha,
    300,
  );
  const tampered = new URL(url);
  tampered.searchParams.set('key', 'incoming/lot/other');
  expect((await put(tampered.href)).status).toBe(403);
  expect(
    (await put(url, photo, { 'x-amz-meta-sha256': 'f'.repeat(64) })).status,
  ).toBe(403);
  expect((await put(url, photo, { 'Content-Type': 'image/png' })).status).toBe(
    403,
  );
  const expired = await store.presign(
    'incoming/lot/photo',
    'image/webp',
    photo.length,
    sha,
    -1,
  );
  expect((await put(expired)).status).toBe(403);
  await expect(store.read('incoming/lot/photo')).rejects.toThrow();
});

it('refuses a body larger or smaller than the accepted size', async () => {
  const url = await store.presign(
    'incoming/lot/photo',
    'image/webp',
    photo.length,
    sha,
    300,
  );
  expect((await put(url, Buffer.concat([photo, photo]))).status).toBe(413);
  expect((await put(url, photo.subarray(0, 4))).status).toBe(400);
});

it('serves public derivatives only, and never a path outside its folder', async () => {
  // Stored as an HTTPS alias (the database only accepts HTTPS photo URLs).
  expect(await store.write('catalogue/lot/photo/320.webp', photo)).toBe(
    'https://dev-images.auction.invalid/catalogue/lot/photo/320.webp',
  );
  const res = await fetch(
    `${base}/dev-images/public/catalogue/lot/photo/320.webp`,
  );
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/webp');
  expect(Buffer.from(await res.arrayBuffer())).toEqual(photo);
  // Private originals are not public.
  await store.writePrivate('incoming/lot/photo', photo);
  expect(
    (await fetch(`${base}/dev-images/public/incoming/lot/photo`)).status,
  ).toBe(404);
  expect(
    (
      await fetch(
        `${base}/dev-images/public/..%2Fprivate%2Fincoming%2Flot%2Fphoto`,
      )
    ).status,
  ).toBe(404);
  await expect(store.write('../escape.webp', photo)).rejects.toThrow();
  await expect(store.read('incoming/../../x')).rejects.toThrow();
});

it('is development only and needs an explicit folder', () => {
  vi.stubEnv('R2_ACCOUNT_ID', '');
  vi.stubEnv('LOCAL_IMAGE_DIR', '');
  expect(configuredImageStore()).toBeUndefined();
  vi.stubEnv('LOCAL_IMAGE_DIR', dir);
  expect(configuredImageStore()).toBeInstanceOf(LocalImageStore);
  vi.stubEnv('NODE_ENV', 'production');
  expect(() => configuredImageStore()).toThrow(/development only/);
  expect(() => new LocalImageStore(dir, base)).toThrow(/development only/);
});
