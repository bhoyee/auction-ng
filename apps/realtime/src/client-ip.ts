import type { Socket } from 'socket.io';
import {
  CLIENT_IP_HEADER,
  resolveClientIp,
  trustForwardedClientIp,
} from '@auction-ng/shared';

// Connection limits key on the visitor, not Caddy's container address.
// See packages/shared/src/client-ip.ts for when the header is believed.
export function socketClientIp(socket: Socket) {
  return resolveClientIp({
    remoteAddress: socket.handshake.address,
    forwarded: socket.handshake.headers[CLIENT_IP_HEADER],
    trustForwarded: trustForwardedClientIp(process.env.TRUST_PROXY_CLIENT_IP),
  });
}
