import type { Page } from '@playwright/test';

// Mocks the realtime pause signal and the signed-in buyer endpoints; other
// API calls go to the real API under test.
export async function pauseFixture(
  page: Page,
  api: string,
  { guest = false, offline = false } = {},
) {
  let controlCounter = 0;
  let pausedAt: number | undefined;
  let endsAt = Date.now() + 1200000;
  const signals: (() => void)[] = [];
  await page.routeWebSocket(/socket\.io/, (socket) => {
    let namespace = '';
    socket.send(
      '0' +
        JSON.stringify({
          sid: 'buyer-pause',
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    const signal = () =>
      socket.send(
        '42' +
          namespace +
          JSON.stringify([
            'auction:control',
            {
              paused: pausedAt !== undefined,
              revision: controlCounter.toString(16).padStart(64, '0'),
              serverTime: new Date().toISOString(),
            },
          ]),
      );
    signals.push(signal);
    socket.onClose(() => {
      const index = signals.indexOf(signal);
      if (index >= 0) signals.splice(index, 1);
    });
    socket.onMessage((message) => {
      const text = String(message);
      if (text.startsWith('40')) {
        namespace = text.startsWith('40/public,') ? '/public,' : '';
        socket.send('40' + namespace + JSON.stringify({ sid: 'buyer-pause' }));
        signal();
      }
      const match = /^42(?:\/public,)?(\d+)(\[.*\])$/.exec(text);
      if (!match?.[2]) return;
      const [event, input] = JSON.parse(match[2]) as [
        string,
        { lotId?: string },
      ];
      let result: unknown;
      if (event === 'clock:sync')
        result = { serverTime: new Date().toISOString() };
      if (event === 'lot:subscribe')
        result = {
          ok: true,
          lot: {
            lotId: input.lotId,
            currentPriceKobo: 100000,
            endsAt: new Date(endsAt).toISOString(),
            serverTime: new Date().toISOString(),
            streamId: '1-0',
            isLeader: false,
            ...(pausedAt === undefined ? {} : { pausedAt }),
          },
        };
      if (result)
        socket.send('43' + namespace + match[1] + JSON.stringify([result]));
    });
  });
  const id = '10000000-0000-4000-8000-000000000090';
  await page.route(api + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (guest && path === '/auth/refresh') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{}',
      });
      return;
    }
    let body: unknown;
    if (path === '/auth/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Ada Okafor',
          email: 'buyer@example.test',
          role: 'buyer',
          status: 'active',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    else if (path === '/wallet')
      body = {
        id,
        userId: id,
        currency: 'NGN',
        availableKobo: 100000000,
        heldKobo: 0,
        totalKobo: 100000000,
      };
    else if (path.endsWith('/bid-cancellation'))
      body = {
        commitment: null,
        canRequest: false,
        blocked: false,
        conversation: null,
      };
    else if (path === '/buyers/notifications/summary')
      body = { unread: 0, awaitingPickup: 0 };
    else if (path === '/buyers/watchlist/count') body = { count: 0 };
    else if (path === '/buyers/notifications/messages')
      body = { items: [], nextCursor: null };
    else if (offline) {
      // No API runs for these checks; answer anything else as not found.
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: '{}',
      });
      return;
    } else return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return {
    pause() {
      controlCounter++;
      pausedAt = Date.now();
      signals.forEach((send) => send());
    },
    resume() {
      controlCounter++;
      endsAt += Date.now() - (pausedAt ?? Date.now());
      pausedAt = undefined;
      signals.forEach((send) => send());
    },
  };
}
