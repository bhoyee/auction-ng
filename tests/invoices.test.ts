import { describe, expect, it } from 'vitest';
import { calculateInvoiceLine } from '../packages/shared/src/fees';
import {
  allocateRefund,
  invoicePaymentState,
  invoicePickupState,
  refundRequestSchema,
  splitRefund,
} from '../packages/shared/src/invoices';

describe('invoice amounts', () => {
  it('match the mockup: INV-88213, four lots', () => {
    const lines = [950_000, 620_000, 780_000, 240_000].map((hammer) =>
      calculateInvoiceLine(hammer),
    );
    const sum = (key: keyof (typeof lines)[number]) =>
      lines.reduce((s, l) => s + l[key], 0);
    expect(sum('hammerKobo')).toBe(2_590_000);
    expect(sum('premiumKobo')).toBe(388_500);
    expect(sum('lotFeeKobo')).toBe(120_000);
    expect(sum('vatKobo')).toBe(38_138);
    expect(sum('totalKobo')).toBe(3_136_638);
    expect(lines.map((l) => l.totalKobo)).toEqual([
      1_135_438, 752_225, 938_025, 310_950,
    ]);
  });
});

describe('partial refunds', () => {
  const line = calculateInvoiceLine(950_000);
  it('split a refund into hammer, premium, lot fee and VAT', () => {
    const half = splitRefund(line, 0, 500_000);
    expect(
      half.hammerKobo + half.premiumKobo + half.lotFeeKobo + half.vatKobo,
    ).toBe(500_000);
    const all = splitRefund(line, 0, line.totalKobo);
    expect(all).toEqual({
      hammerKobo: line.hammerKobo,
      premiumKobo: line.premiumKobo,
      lotFeeKobo: line.lotFeeKobo,
      vatKobo: line.vatKobo,
    });
  });
  it('add up exactly to the line however they are broken up', () => {
    let seed = 11;
    const random = (max: number) =>
      (seed = (seed * 48_271) % 2_147_483_647) % max;
    for (let run = 0; run < 200; run++) {
      const l = calculateInvoiceLine(1 + random(90_000_000));
      let done = 0;
      const total = {
        hammerKobo: 0,
        premiumKobo: 0,
        lotFeeKobo: 0,
        vatKobo: 0,
      };
      while (done < l.totalKobo) {
        const amount = Math.min(
          l.totalKobo - done,
          1 + random(Math.max(2, Math.ceil(l.totalKobo / 2))),
        );
        const part = splitRefund(l, done, amount);
        for (const key of Object.keys(total) as (keyof typeof total)[]) {
          expect(part[key]).toBeGreaterThanOrEqual(-3);
          total[key] += part[key];
        }
        done += amount;
      }
      expect(total).toEqual({
        hammerKobo: l.hammerKobo,
        premiumKobo: l.premiumKobo,
        lotFeeKobo: l.lotFeeKobo,
        vatKobo: l.vatKobo,
      });
    }
  });
  it('stay inside what the database allows, kobo by kobo', () => {
    const l = calculateInvoiceLine(50_000);
    for (const steps of [
      [l.totalKobo - 1, 1],
      [l.totalKobo - 2, 1, 1],
      ...Array.from({ length: 400 }, (_, n) => [n + 1, 1, 1, 1]),
    ]) {
      let done = 0;
      let hammer = 0;
      let premium = 0;
      for (const amount of steps) {
        const part = splitRefund(l, done, amount);
        const fees = part.premiumKobo + part.lotFeeKobo;
        expect(fees).toBeGreaterThanOrEqual(0);
        expect(fees).toBeLessThanOrEqual(amount);
        expect(part.hammerKobo).toBeGreaterThanOrEqual(0);
        done += amount;
        hammer += part.hammerKobo;
        premium += part.premiumKobo;
        expect(hammer).toBeLessThanOrEqual(l.hammerKobo);
        expect(premium).toBeLessThanOrEqual(l.premiumKobo);
        expect(hammer + premium).toBeLessThanOrEqual(done);
      }
    }
  });
  it('never refund more than was paid', () => {
    expect(() => splitRefund(line, 0, line.totalKobo + 1)).toThrow();
    expect(() => splitRefund(line, line.totalKobo, 1)).toThrow();
    expect(() => splitRefund(line, 0, 0)).toThrow();
    expect(() => splitRefund(line, 0, 1.5)).toThrow();
  });
  it('come back through the wallet charges that paid', () => {
    const charges = [
      { id: 'a', leftKobo: 100 },
      { id: 'b', leftKobo: 0 },
      { id: 'c', leftKobo: 50 },
    ];
    expect(allocateRefund(charges, 120)).toEqual([
      { id: 'a', amountKobo: 100 },
      { id: 'c', amountKobo: 20 },
    ]);
    expect(() => allocateRefund(charges, 151)).toThrow();
  });
  it('need a reason, a note and whole amounts', () => {
    const input = {
      idempotencyKey: crypto.randomUUID(),
      invoiceId: crypto.randomUUID(),
      reason: 'damaged',
      note: 'Cracked jug',
      lines: [{ lineId: crypto.randomUUID(), amountKobo: 100 }],
    };
    expect(refundRequestSchema.safeParse(input).success).toBe(true);
    for (const change of [
      { reason: 'because' },
      { note: '' },
      { lines: [] },
      { lines: [{ lineId: input.lines[0]?.lineId, amountKobo: 0 }] },
      { lines: [...input.lines, ...input.lines] },
      { amount: 1 },
    ])
      expect(
        refundRequestSchema.safeParse({ ...input, ...change }).success,
      ).toBe(false);
  });
});

describe('what an invoice shows as', () => {
  const base = {
    status: 'paid',
    refundedKobo: 0,
    refundPending: false,
    disputed: false,
  };
  it('shows the most important thing first', () => {
    expect(invoicePaymentState(base)).toBe('paid');
    expect(invoicePaymentState({ ...base, refundedKobo: 5 })).toBe(
      'partly_refunded',
    );
    expect(
      invoicePaymentState({ ...base, refundedKobo: 5, refundPending: true }),
    ).toBe('refund_pending');
    expect(
      invoicePaymentState({ ...base, refundPending: true, disputed: true }),
    ).toBe('disputed');
    expect(invoicePaymentState({ ...base, status: 'refunded' })).toBe(
      'refunded',
    );
  });
  it('follows the pickup', () => {
    const now = new Date('2026-11-25T10:00:00Z');
    const at = (
      fulfilment: string | null,
      dueAt: string | null,
      done = false,
    ) =>
      invoicePickupState({
        fulfilment,
        collectedAt: done ? now : null,
        dueAt: dueAt ? new Date(dueAt) : null,
        now,
      });
    expect(at(null, null)).toBe('none');
    expect(at('pending', null)).toBe('preparing');
    expect(at('ready', '2026-11-26')).toBe('ready');
    expect(at('ready', '2026-11-20')).toBe('overdue');
    expect(at('ready', '2026-11-20', true)).toBe('collected');
    expect(at('cancelled', null)).toBe('cancelled');
  });
});
