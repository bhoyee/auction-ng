import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  inlineEmailLogo,
  emailLogoAttachments,
} from '../apps/api/src/email/branding';
import brand from '../apps/api/src/email/brand.generated.json';
import { readWinnerPickup } from '../apps/api/src/closing/winner-pickup';
import type { Prisma } from '../apps/api/src/generated/prisma/client';
import { emailBrandHeader } from '../packages/ui/emails/brand';
import { MailpitDelivery } from '../apps/api/src/email/mail-delivery';
afterEach(() => vi.unstubAllGlobals());
it('uses a small embedded real logo with a readable brand fallback and no remote tracking', () => {
  const attachments = emailLogoAttachments(brand.html);
  expect(attachments).toHaveLength(1);
  expect(
    attachments[0]?.content.equals(readFileSync('packages/ui/emails/logo.png')),
  ).toBe(true);
  expect(attachments[0]?.content.byteLength).toBeLessThan(20000);
  expect(brand.html).toContain('alt="LotVanta"');
  expect(brand.html).toContain('Bid. Win. Save.');
  expect(brand.html).toBe(emailBrandHeader());
  expect(brand.html).not.toMatch(/https?:\/\//);
  expect(inlineEmailLogo(brand.html)).toContain('data:image/png;base64,');
  expect(inlineEmailLogo(brand.html)).not.toContain('cid:');
  expect(emailLogoAttachments('<p>No brand image</p>')).toEqual([]);
});
it('renders the embedded logo in local email preview without downloading any remote asset', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await new MailpitDelivery('http://localhost:8025').send(
    'preview@example.test',
    {
      Subject: 'Synthetic preview',
      Text: 'Synthetic preview',
      HTML: brand.html,
    },
  );
  const body = JSON.parse(fetch.mock.calls[0]?.[1].body as string) as {
    HTML: string;
  };
  expect(body.HTML).toContain('src="data:image/png;base64,');
  expect(body.HTML).not.toContain('cid:');
  expect(body.HTML).not.toMatch(/https?:\/\//);
});
it('reads the buyer-owned saved pickup terms, including extensions and waivers', async () => {
  const findFirst = vi.fn().mockResolvedValue({
    storageCase: {
      dueAt: new Date('2026-11-18T16:00:00Z'),
      dailyKobo: 150000n,
      capKobo: 900000n,
      waived: true,
      collectedAt: null,
    },
  });
  const result = await readWinnerPickup(
    { invoiceLine: { findFirst } } as unknown as Prisma.TransactionClient,
    'buyer-id',
    'invoice-number',
    'lot-number',
  );
  expect(findFirst.mock.calls[0]?.[0].where).toEqual({
    invoice: {
      number: 'invoice-number',
      userId: 'buyer-id',
      fulfilment: { type: 'pickup' },
    },
    lot: { lotNumber: 'lot-number' },
  });
  expect(result).toEqual({
    dueAt: '2026-11-18T16:00:00.000Z',
    dailyKobo: 150000,
    capKobo: 900000,
    waived: true,
    collected: false,
  });
  findFirst.mockResolvedValueOnce({ storageCase: null });
  expect(
    await readWinnerPickup(
      { invoiceLine: { findFirst } } as unknown as Prisma.TransactionClient,
      'buyer-id',
      'invoice-number',
      'lot-number',
    ),
  ).toBeNull();
});
