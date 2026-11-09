import { it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { createRealtime } from '../../realtime/src/server';
import { connectStaffActivity } from '../../../packages/api-client/src/staff-admin';
it('routes staff invalidations to the intended user or staff workspace without exposing data to buyers', async () => {
  const prefix = 'test:staff-alerts:' + randomUUID() + ':',
    ids = [randomUUID(), randomUUID(), randomUUID()];
  const tokens = ids.map(() => randomBytes(32).toString('base64url'));
  const gateway = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      namespace: prefix,
      authenticate: async (value) => {
        const i = tokens.indexOf(value.accessToken);
        if (i < 0) throw Error('Unknown synthetic session');
        return {
          userId: ids[i] ?? randomUUID(),
          sessionId: randomUUID(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          staffWorkspace: i < 2,
        };
      },
    },
  );
  await new Promise<void>((resolve) =>
    gateway.http.listen(0, '127.0.0.1', resolve),
  );
  const addr = gateway.http.address();
  if (!addr || typeof addr === 'string') throw Error('No test port');
  const redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await redis.connect();
  const count = [0, 0, 0],
    status = [false, false, false];
  const clients = tokens.map((accessToken, i) =>
    connectStaffActivity(
      'http://127.0.0.1:' + addr.port,
      { accessToken, deviceId: randomUUID() },
      () => {
        count[i] = (count[i] ?? 0) + 1;
      },
      (connected) => {
        status[i] = connected;
      },
    ),
  );
  async function until(check: () => boolean) {
    const end = Date.now() + 5000;
    while (!check()) {
      if (Date.now() > end) throw Error('Realtime check timed out');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  try {
    await until(() => status.every(Boolean));
    count.fill(0);
    await redis.publish(
      prefix + 'staff-updates',
      JSON.stringify({ userId: ids[0] }),
    );
    await until(() => count[0] === 1);
    expect(count).toEqual([1, 0, 0]);
    await redis.publish(
      prefix + 'staff-updates',
      JSON.stringify({ userId: null }),
    );
    await until(() => count[1] === 1);
    expect(count).toEqual([2, 1, 0]);
  } finally {
    clients.forEach((close) => close());
    await redis.close();
    await gateway.close();
  }
});
