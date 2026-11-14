import { NextResponse, type NextRequest } from 'next/server';
import { lotPath, parseLotPath } from '@auction-ng/shared/lot-path';

const api =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Readable lot addresses (2026-11-14). The lot page streams behind a loading
 * screen, so a redirect or "not found" decided there arrives after a 200.
 * Decide them here instead, before streaming: old /lots/<uuid> links and
 * renamed lots get a permanent redirect, and a missing lot a real 404.
 */
export async function proxy(request: NextRequest) {
  let segment: string;
  try {
    segment = decodeURIComponent(
      request.nextUrl.pathname.slice('/lots/'.length),
    );
  } catch {
    // Malformed %-escapes: not a lot.
    return notFound(request);
  }
  const lotNumber = parseLotPath(segment);
  const path = lotNumber
    ? `/lot-numbers/${encodeURIComponent(lotNumber)}`
    : uuid.test(segment)
      ? `/lots/${segment}`
      : null;
  if (!path) return notFound(request);
  let lot: { id: string; title: string; lotNumber: string } | undefined;
  try {
    const response = await fetch(new URL(path, api), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 404 || response.status === 400)
      return notFound(request);
    // Anything else (API down) is left to the page and its error screen.
    if (!response.ok) return NextResponse.next();
    lot = (await response.json()) as {
      id: string;
      title: string;
      lotNumber: string;
    };
  } catch {
    return NextResponse.next();
  }
  const canonical = lotPath(lot);
  if (canonical === `/lots/${segment}`) return NextResponse.next();
  const target = request.nextUrl.clone();
  target.pathname = canonical;
  return NextResponse.redirect(target, 308);
}

/** The app's "not found" page, with a real 404 status. */
function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL('/lot-not-found', request.url), {
    status: 404,
  });
}

export const config = { matcher: '/lots/:segment' };
