import type { IncomingMessage } from 'node:http';
import {
  CLIENT_IP_HEADER,
  resolveClientIp,
  trustForwardedClientIp,
} from '@auction-ng/shared';

// The address per-IP rate limits key on. Behind Caddy this is the visitor's
// address from X-Client-IP; see packages/shared/src/client-ip.ts.
export function clientIp(request: Pick<IncomingMessage, 'socket' | 'headers'>) {
  return resolveClientIp({
    remoteAddress: request.socket.remoteAddress,
    forwarded: request.headers[CLIENT_IP_HEADER],
    trustForwarded: trustForwardedClientIp(process.env.TRUST_PROXY_CLIENT_IP),
  });
}
