import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { imageRules } from '@auction-ng/shared';
import type { ImageStore } from './image-store';

/** Keys the catalogue and support services use; never a path outside. */
const SAFE_KEY = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const ROUTE = '/dev-images';
/**
 * Photo addresses stored in the database must be HTTPS (a database rule), so
 * development photos are saved under this alias; the web and admin apps
 * redirect /dev-images/public/... to the API, which serves the file.
 */
export const DEV_IMAGE_ORIGIN = 'https://dev-images.auction.invalid';

/**
 * Development-only photo storage on this computer's disk, used when no R2
 * settings are present (owner decision 2026-11-13). It mirrors the R2 flow:
 * a short-lived signed PUT URL for the original, private originals, and
 * public WebP derivatives. Production refuses to start with it.
 */
export class LocalImageStore implements ImageStore {
  // A per-process secret: an upload URL dies with the API process.
  private readonly secret = randomBytes(32);
  private readonly privateDir: string;
  private readonly publicDir: string;

  constructor(
    dir: string,
    private readonly origin: string,
  ) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('The local image store is for development only.');
    const root = path.resolve(dir);
    this.privateDir = path.join(root, 'private');
    this.publicDir = path.join(root, 'public');
  }

  private file(base: string, key: string) {
    if (!SAFE_KEY.test(key) || key.split('/').some((p) => p === '..'))
      throw new Error('Invalid image key.');
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep))
      throw new Error('Invalid image key.');
    return full;
  }

  private sign(fields: string[]) {
    return createHmac('sha256', this.secret)
      .update(fields.join('\n'))
      .digest('hex');
  }

  async presign(
    key: string,
    contentType: string,
    size: number,
    sha256: string,
    expiresIn: number,
  ) {
    this.file(this.privateDir, key);
    const exp = String(Math.floor(Date.now() / 1000) + expiresIn);
    const query = new URLSearchParams({
      key,
      type: contentType,
      size: String(size),
      sha256,
      exp,
      sig: this.sign([key, contentType, String(size), sha256, exp]),
    });
    return `${this.origin}${ROUTE}/upload?${query}`;
  }

  async read(key: string) {
    const bytes = await readFile(this.file(this.privateDir, key));
    if (bytes.length > imageRules.maxUploadBytes)
      throw new Error('Invalid upload size.');
    return bytes;
  }

  async writePrivate(key: string, body: Buffer) {
    const full = this.file(this.privateDir, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async write(key: string, body: Buffer) {
    const full = this.file(this.publicDir, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return `${DEV_IMAGE_ORIGIN}/${key}`;
  }

  /**
   * Express middleware for the signed upload (PUT) and the public files
   * (GET). Mounted before the app's CORS so only these routes allow PUT.
   */
  handler(origins: readonly string[]) {
    return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const url = new URL(req.url ?? '/', 'http://local');
      if (!url.pathname.startsWith(ROUTE + '/')) return next();
      const origin = req.headers.origin;
      if (origin && origins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'PUT, GET');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, x-amz-meta-sha256',
        );
        res.statusCode = 204;
        return res.end();
      }
      if (req.method === 'PUT' && url.pathname === `${ROUTE}/upload`)
        return void this.receive(req, res, url.searchParams);
      if (req.method === 'GET' && url.pathname.startsWith(`${ROUTE}/public/`))
        return void this.serve(
          res,
          url.pathname.slice(`${ROUTE}/public/`.length),
        );
      res.statusCode = 404;
      res.end();
    };
  }

  private async receive(
    req: IncomingMessage,
    res: ServerResponse,
    q: URLSearchParams,
  ) {
    const fail = (status: number) => {
      res.statusCode = status;
      res.end();
      req.resume();
    };
    const [key, type, size, sha256, exp, sig] = [
      'key',
      'type',
      'size',
      'sha256',
      'exp',
      'sig',
    ].map((name) => q.get(name) ?? '');
    const expected = Buffer.from(
      this.sign([key ?? '', type ?? '', size ?? '', sha256 ?? '', exp ?? '']),
    );
    const given = Buffer.from(sig ?? '');
    const bytes = Number(size);
    if (
      given.length !== expected.length ||
      !timingSafeEqual(given, expected) ||
      Number(exp) * 1000 < Date.now() ||
      req.headers['content-type'] !== type ||
      req.headers['x-amz-meta-sha256'] !== sha256 ||
      !Number.isSafeInteger(bytes) ||
      bytes < 1 ||
      bytes > imageRules.maxUploadBytes
    )
      return fail(403);
    const chunks: Buffer[] = [];
    let received = 0;
    try {
      for await (const chunk of req) {
        received += (chunk as Buffer).length;
        if (received > bytes) return fail(413);
        chunks.push(chunk as Buffer);
      }
      if (received !== bytes) return fail(400);
      await this.writePrivate(key ?? '', Buffer.concat(chunks));
    } catch {
      return fail(400);
    }
    res.statusCode = 200;
    res.end();
  }

  private async serve(res: ServerResponse, encoded: string) {
    try {
      // A malformed escape throws here and becomes a plain 404.
      const key = decodeURIComponent(encoded);
      if (!key.endsWith('.webp')) throw new Error('not an image');
      const body = await readFile(this.file(this.publicDir, key));
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  }
}
