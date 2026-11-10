// The visitor address used for per-IP rate limits.
//
// In production every request reaches the API and the realtime gateway through
// Caddy, so the socket address is Caddy's container, not the buyer. Caddy
// overwrites `X-Client-IP` with the address it trusts (the TCP peer, or
// Cloudflare's CF-Connecting-IP when the request came from a Cloudflare edge).
// The header is only believed when the operator turned trust on and the
// request really came from a private-network peer, so a visitor who reaches
// the service directly cannot pick their own rate-limit bucket.

export const CLIENT_IP_HEADER = 'x-client-ip';

const unmapped = (address: string) =>
  address.toLowerCase().startsWith('::ffff:') && address.includes('.')
    ? address.slice(7)
    : address;

const ipv4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIpv6(value: string) {
  if (value.length > 45 || !/^[0-9a-f:.]+$/i.test(value)) return false;
  // A lone colon may not start or end the address, and ':::' is never valid.
  if (value.includes(':::')) return false;
  if (/^:[^:]/.test(value) || /[^:]:$/.test(value)) return false;
  const doubles = value.split('::').length - 1;
  if (doubles > 1) return false;
  const groups = value.split(':');
  const last = groups[groups.length - 1] ?? '';
  const tail = last.includes('.') ? (ipv4.test(last) ? 2 : -1) : 0;
  if (tail < 0) return false;
  const hex = (tail ? groups.slice(0, -1) : groups).filter((g) => g !== '');
  if (!hex.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  const count = hex.length + tail;
  return doubles ? count < 8 : count === 8;
}

export function isIpAddress(value: string) {
  return ipv4.test(value) || isIpv6(value);
}

// Loopback, RFC 1918, carrier-grade NAT, link-local and IPv6 ULA/loopback:
// the addresses a container network or the host itself uses.
export function isPrivateAddress(address: string) {
  const value = unmapped(address.trim());
  if (ipv4.test(value)) {
    const [a = 0, b = 0] = value.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254)
    );
  }
  if (!isIpv6(value)) return false;
  const lower = value.toLowerCase();
  return (
    lower === '::1' ||
    /^f[cd][0-9a-f]{2}:/.test(lower) ||
    /^fe[89ab][0-9a-f]:/.test(lower)
  );
}

export function resolveClientIp(input: {
  remoteAddress: string | undefined;
  forwarded: string | string[] | undefined;
  trustForwarded: boolean;
}) {
  const remote = input.remoteAddress
    ? unmapped(input.remoteAddress)
    : 'unknown';
  if (!input.trustForwarded || !isPrivateAddress(remote)) return remote;
  // Node joins a repeated header with ", ", which fails the address check
  // below; the array guard only covers callers that pass raw header lists.
  if (typeof input.forwarded !== 'string') return remote;
  const candidate = unmapped(input.forwarded.trim());
  return isIpAddress(candidate) ? candidate.toLowerCase() : remote;
}

export const trustForwardedClientIp = (value: string | undefined) =>
  value === 'true';
