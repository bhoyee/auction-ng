import { expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { connectSupport } from '../../../packages/api-client/src/support';
import { createRealtime } from '../../realtime/src/server';
it('routes support invalidations only to the owner and authorised staff, with no chat contents in events', async () => {
  const prefix = `test:support:${randomUUID()}:`,
    user = randomUUID(),
    other = randomUUID(),
    admin = randomUUID(),
    conversation = randomUUID();
  const sessions = new Map<
    string,
    {
      userId: string;
      sessionId: string;
      expiresAt: string;
      supportStaff?: boolean;
    }
  >();
  const token = (id: string, supportStaff = false) => {
    const key = randomBytes(32).toString('base64url');
    sessions.set(key, {
      userId: id,
      sessionId: randomUUID(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      supportStaff,
    });
    return key;
  };
  const gateway = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      namespace: prefix,
      authenticate: async (value) => {
        const session = sessions.get(value.accessToken);
        if (!session) throw Error('Invalid fixture');
        return session;
      },
    },
  );
  await new Promise<void>((resolve) =>
    gateway.http.listen(0, '127.0.0.1', resolve),
  );
  const address = gateway.http.address();
  if (!address || typeof address === 'string') throw Error('No port');
  const publisher = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await publisher.connect();
  const events: unknown[][] = [[], [], []];
  const ready: Promise<void>[] = [];
  const clients = [token(user), token(other), token(admin, true)].map(
    (accessToken, index) => {
      let resolveReady = () => {};
      ready.push(
        new Promise<void>((resolve) => {
          resolveReady = resolve;
        }),
      );
      return connectSupport(
        `http://127.0.0.1:${address.port}`,
        { accessToken, deviceId: randomUUID() },
        (id) => {
          if (id) events[index]?.push({ conversationId: id });
        },
        (connected) => {
          if (connected) resolveReady();
        },
      );
    },
  );
  try {
    await Promise.all(ready);
    await publisher.publish(
      prefix + 'support-updates',
      JSON.stringify({
        conversationId: conversation,
        buyerId: user,
        staffOnly: false,
      }),
    );
    await expect.poll(() => events[0]?.length).toBe(1);
    await expect.poll(() => events[2]?.length).toBe(1);
    expect(events[1]).toHaveLength(0);
    expect(events[0]?.[0]).toEqual({ conversationId: conversation });
    await publisher.publish(
      prefix + 'support-updates',
      JSON.stringify({
        conversationId: conversation,
        buyerId: user,
        staffOnly: true,
      }),
    );
    await expect.poll(() => events[2]?.length).toBe(2);
    expect(events[0]).toHaveLength(1);
    expect(events[1]).toHaveLength(0);
    await publisher.publish(
      prefix + 'support-updates',
      JSON.stringify({
        conversationId: conversation,
        buyerId: user,
        staffOnly: false,
        text: 'Must not cross the bridge',
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events[0]).toHaveLength(1);
  } finally {
    for (const close of clients) close();
    await publisher.close();
    await gateway.close();
  }
});
