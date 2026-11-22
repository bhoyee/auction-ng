import { describe, expect, it } from 'vitest';
import {
  buyerDisplayName,
  saleAlertText,
  type SaleAlert,
} from '../src/alerts/sale-alert-message';
import {
  AdminAlertError,
  CallMeBotProvider,
  createAdminAlertProvider,
} from '../src/alerts/admin-alert-provider';

const alert = (over: Partial<SaleAlert> = {}): SaleAlert => ({
  kind: 'auction',
  orderNumber: 'INV-8F3K2Q',
  title: 'iPhone 15 128GB',
  lotNumber: 'K7Q2M9XA',
  location: 'Lekki warehouse',
  priceKobo: 25_000_000,
  totalKobo: 29_016_300,
  moreItems: 0,
  buyer: 'Chiamaka O.',
  paidAt: '2026-11-21T16:42:00.000Z',
  ...over,
});

describe('WhatsApp sale alert text', () => {
  it('formats a won deal in Naira and Lagos time, one fact per line', () => {
    expect(saleAlertText(alert())).toBe(
      [
        'GiddyDeal: Deal won',
        'Item: iPhone 15 128GB (Lot K7Q2M9XA)',
        'Winning bid: ₦250,000 · Paid ₦290,163',
        'Buyer: Chiamaka O.',
        'Order: INV-8F3K2Q',
        'Pickup: Lekki warehouse',
        '21 Nov 2026, 5:42 pm',
      ].join('\n'),
    );
  });

  it('labels Buy Now sales by item price and notes extra items', () => {
    const text = saleAlertText(
      alert({ kind: 'buy-now', priceKobo: 1_000_000, moreItems: 2 }),
    );
    expect(text.split('\n')[0]).toBe('GiddyDeal: Buy Now sale');
    expect(text).toContain('Price: ₦10,000 · Paid');
    expect(text).toContain('(Lot K7Q2M9XA) + 2 more items');
  });

  it('shortens long titles and leaves out a missing pickup site', () => {
    const text = saleAlertText(
      alert({ title: 'Samsung '.repeat(20), location: null }),
    );
    const item = text.split('\n')[1] ?? '';
    expect(item.length).toBeLessThan(90);
    expect(item).toContain('…');
    expect(text).not.toContain('Pickup:');
  });

  it('shows only a first name and initial for the buyer', () => {
    expect(buyerDisplayName('Chiamaka Ngozi Okafor')).toBe('Chiamaka O.');
    expect(buyerDisplayName('Tunde')).toBe('Tunde');
    expect(buyerDisplayName('  ')).toBe('Buyer');
    expect(buyerDisplayName(null)).toBe('Buyer');
  });
});

describe('CallMeBot provider', () => {
  const reply = (status: number, body: string) =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;

  it('is off unless a valid phone and key are both set', () => {
    expect(createAdminAlertProvider({})).toBeUndefined();
    expect(
      createAdminAlertProvider({
        ADMIN_WHATSAPP_PHONE: '08031234567',
        CALLMEBOT_API_KEY: '123456',
      }),
    ).toBeUndefined();
    expect(
      createAdminAlertProvider({
        ADMIN_WHATSAPP_PHONE: '+2348031234567',
        CALLMEBOT_API_KEY: '123456',
      }),
    ).toBeInstanceOf(CallMeBotProvider);
  });

  it('sends the phone, text and key to the WhatsApp endpoint', async () => {
    let seen: URL | undefined;
    const provider = new CallMeBotProvider('+2348031234567', '123456', (async (
      url: URL,
    ) => {
      seen = url;
      return new Response('Message queued. You will receive it shortly.');
    }) as unknown as typeof fetch);
    await provider.send('GiddyDeal: Deal won\nOrder: INV-1');
    expect(seen?.origin + (seen?.pathname ?? '')).toBe(
      'https://api.callmebot.com/whatsapp.php',
    );
    expect(seen?.searchParams.get('phone')).toBe('+2348031234567');
    expect(seen?.searchParams.get('apikey')).toBe('123456');
    expect(seen?.searchParams.get('text')).toBe(
      'GiddyDeal: Deal won\nOrder: INV-1',
    );
  });

  it('treats HTTP failures and error replies as not sent, without leaking the key', async () => {
    for (const fetcher of [
      reply(500, 'oops'),
      reply(200, 'APIKey is invalid'),
      // Real reply from a paused CallMeBot account (2026-11-21).
      reply(
        208,
        'Message to: +2348031234567 Your Account is Paused (dissabled). This request has been ignored (no message will be sent). Send the word Resume to the Bot.',
      ),
      reply(
        200,
        'Your Account is Paused. This request has been ignored (no message will be sent).',
      ),
      (async () => {
        throw new Error('https://api.callmebot.com/?apikey=123456');
      }) as unknown as typeof fetch,
    ]) {
      const error = await new CallMeBotProvider(
        '+2348031234567',
        '123456',
        fetcher,
      )
        .send('x')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AdminAlertError);
      expect(String((error as Error).message)).not.toContain('123456');
    }
  });
});
