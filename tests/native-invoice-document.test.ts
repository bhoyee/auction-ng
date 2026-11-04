import { expect, it } from 'vitest';
import {
  invoiceDocument,
  invoiceSummary,
  type InvoiceDocument,
} from '../apps/mobile/lib/invoice-document';

const invoice: InvoiceDocument = {
  id: '11111111-1111-4111-8111-111111111111',
  number: 'INV-LV8KT2P9',
  status: 'paid',
  saleType: 'fixed_price',
  createdAt: '2026-11-04T23:30:00Z',
  hammerTotalKobo: 10000000,
  premiumKobo: 0,
  lotFeeKobo: 0,
  vatKobo: 750000,
  totalKobo: 10750000,
  lines: [
    {
      lot: {
        id: '22222222-2222-4222-8222-222222222222',
        lotNumber: 'LV8KT2P9',
        title: '<script>alert("bad")</script>',
        status: 'closed',
      },
      totalKobo: 10750000,
    },
  ],
  pickup: { location: 'Lagos & Lekki <collection>', status: 'awaiting_pickup' },
};
it('escapes invoice text and keeps stored totals, tax and WAT dates in the PDF', () => {
  const html = invoiceDocument(invoice, '<Ada & family>');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&lt;Ada &amp; family&gt;');
  expect(html).toContain('Lagos &amp; Lekki &lt;collection&gt;');
  expect(html).toContain('5 November 2026');
  expect(html).toContain('107,500');
  expect(html).toContain('Total paid');
  expect(html).not.toContain('Service charge');
});
it('lists charged auction fees without recomputing historical values', () => {
  const item = {
    ...invoice,
    saleType: 'auction' as const,
    premiumKobo: 1500000,
    lotFeeKobo: 30000,
  };
  expect(invoiceSummary(item)).toEqual([
    { label: 'Item subtotal', amount: 10000000 },
    { label: 'Service charge', amount: 1500000 },
    { label: 'Lot fee', amount: 30000 },
    { label: 'Tax', amount: 750000 },
  ]);
});
it.each(['pending', 'refunded', 'cancelled'] as const)(
  'does not label %s invoices as paid',
  (status) => {
    const html = invoiceDocument({ ...invoice, status, pickup: null }, 'Ada');
    expect(html).toContain('Invoice total');
    expect(html).not.toContain('Total paid');
    expect(html).toContain('See collection instructions');
  },
);
