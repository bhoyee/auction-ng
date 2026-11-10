import { afterEach, describe, expect, it } from 'vitest';
import {
  isIpAddress,
  isPrivateAddress,
  resolveClientIp,
} from '@auction-ng/shared';
import { clientIp } from '../src/security/client-ip';

describe('resolveClientIp', () => {
  const caddy = '::ffff:172.18.0.4';
  it.each([
    // [remote, header, trust, expected]
    [caddy, '102.89.34.10', true, '102.89.34.10'],
    [caddy, '2c0f:f5c0:440::1', true, '2c0f:f5c0:440::1'],
    [caddy, '::ffff:102.89.34.10', true, '102.89.34.10'],
    ['10.0.0.7', ' 41.58.1.2 ', true, '41.58.1.2'],
    ['127.0.0.1', '41.58.1.2', true, '41.58.1.2'],
    ['fd12:3456::9', '41.58.1.2', true, '41.58.1.2'],
    // Trust off (local dev): the socket address wins.
    [caddy, '102.89.34.10', false, '172.18.0.4'],
    // A public peer reached the service directly: never believe its header.
    ['102.89.34.99', '1.2.3.4', true, '102.89.34.99'],
    ['::ffff:197.210.5.5', '1.2.3.4', true, '197.210.5.5'],
    // Missing, malformed or repeated headers fall back to the peer.
    [caddy, undefined, true, '172.18.0.4'],
    [caddy, '', true, '172.18.0.4'],
    [caddy, 'unknown', true, '172.18.0.4'],
    [caddy, '1.2.3.4, 5.6.7.8', true, '172.18.0.4'],
    [caddy, '999.1.1.1', true, '172.18.0.4'],
    [caddy, ['1.2.3.4', '5.6.7.8'], true, '172.18.0.4'],
    [undefined, '1.2.3.4', true, 'unknown'],
  ] as const)('%s + %j (trust %s) -> %s', (remote, header, trust, expected) => {
    expect(
      resolveClientIp({
        remoteAddress: remote,
        forwarded: header as string | string[] | undefined,
        trustForwarded: trust,
      }),
    ).toBe(expected);
  });

  it('classifies private and public addresses', () => {
    for (const a of [
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '127.0.0.1',
      '100.64.0.1',
      '::1',
      'fc00::1',
      'fd12:3456::9',
      'fe80::1',
      '::ffff:172.18.0.2',
    ])
      expect(isPrivateAddress(a), a).toBe(true);
    for (const a of [
      '172.32.0.1',
      '8.8.8.8',
      '102.89.34.10',
      '2606:4700::1',
      'fc::1',
      'fe8::1',
      'not-an-ip',
      '',
    ])
      expect(isPrivateAddress(a), a).toBe(false);
  });

  it('accepts only well-formed addresses', () => {
    for (const a of [
      '1.2.3.4',
      '::',
      '::1',
      '2001:db8::8a2e:370:7334',
      '::ffff:1.2.3.4',
    ])
      expect(isIpAddress(a), a).toBe(true);
    for (const a of [
      '1.2.3',
      '01.2.3.4',
      '1:2:3:4:5:6:7:8:9',
      '1::2::3',
      'g::1',
      '1.2.3.4 ',
      ':::',
      '1:::2',
      '1::2:',
      ':1::2',
    ])
      expect(isIpAddress(a), a).toBe(false);
  });
});

describe('clientIp (API requests)', () => {
  const previous = process.env.TRUST_PROXY_CLIENT_IP;
  afterEach(() => {
    if (previous === undefined) delete process.env.TRUST_PROXY_CLIENT_IP;
    else process.env.TRUST_PROXY_CLIENT_IP = previous;
  });
  const request = (header?: string) => ({
    socket: { remoteAddress: '::ffff:172.18.0.4' },
    headers: header ? { 'x-client-ip': header } : {},
  });

  it('uses the Caddy header only when trust is turned on', () => {
    delete process.env.TRUST_PROXY_CLIENT_IP;
    expect(clientIp(request('102.89.34.10') as never)).toBe('172.18.0.4');
    process.env.TRUST_PROXY_CLIENT_IP = 'true';
    expect(clientIp(request('102.89.34.10') as never)).toBe('102.89.34.10');
    expect(clientIp(request() as never)).toBe('172.18.0.4');
  });
});
