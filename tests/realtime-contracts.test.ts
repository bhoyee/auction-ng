import { expect, it } from 'vitest';
import { compareStreamIds, liveLotSchema } from '../packages/shared/src';
import { createUseLiveLot } from '../packages/api-client/src/realtime-hook';
import { createRealtimeClient } from '../packages/api-client/src/realtime';
import { createRequire } from 'node:module';
it('orders stream coordinates numerically and rejects private fields in public snapshots', () => {
  expect(compareStreamIds('100-10', '100-2')).toBe(1);
  expect(compareStreamIds('99-99', '100-0')).toBe(-1);
  expect(compareStreamIds('100-0', '100-0')).toBe(0);
  expect(() => compareStreamIds('bad', '0-0')).toThrow();
  expect(liveLotSchema.safeParse({ lotId: 'bad', maxKobo: 1000 }).success).toBe(
    false,
  );
});
it.each(['web', 'mobile'])(
  'binds the shared hook to the %s app React without another React dependency',
  (app) => {
    const require = createRequire(
      new URL(`../apps/${app}/package.json`, import.meta.url),
    );
    const react =
      require('react') as typeof import('../apps/web/node_modules/@types/react');
    const { renderToString } =
      require('react-dom/server') as typeof import('../apps/web/node_modules/@types/react-dom/server');
    const client = createRealtimeClient('http://localhost:4001', {
      credentials: () => ({
        accessToken: 'x'.repeat(43),
        deviceId: '11111111-1111-4111-8111-111111111111',
      }),
    });
    const useLiveLot = createUseLiveLot(react);
    function Fixture() {
      return react.createElement(
        'span',
        null,
        useLiveLot(client, '11111111-1111-4111-8111-111111111111').status,
      );
    }
    try {
      expect(renderToString(react.createElement(Fixture))).toBe(
        '<span>connecting</span>',
      );
    } finally {
      client.close();
    }
  },
);
