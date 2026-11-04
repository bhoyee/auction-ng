import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { winnerEmail } from '../apps/api/src/closing/winner-email';
import template from '../apps/api/src/closing/winner-email.generated.json';
const receipt = {
  invoiceNumber: 'ANG-RATES',
  title: 'Synthetic phone',
  lotNumber: 'AB12CD34',
  hammerKobo: 1000000,
  premiumKobo: 125000,
  lotFeeKobo: 30000,
  vatKobo: 11625,
  totalKobo: 1166625,
  location: 'Lagos hub',
  address: 'Synthetic address',
  status: 'paid' as const,
  deadline: null,
};
it.each([
  [1500, 750, '15%', '7.5%'],
  [1250, 125, '12.5%', '1.25%'],
  [0, 0, '0%', '0%'],
])(
  'prints the agreed percentages in HTML and plain text (%s, %s)',
  (premiumBps, vatBps, service, vat) => {
    const mail = winnerEmail({ ...receipt, feeRates: { premiumBps, vatBps } });
    for (const body of [mail.HTML, mail.Text]) {
      expect(body).toContain(`Service charge (${service})`);
      expect(body).toContain(`VAT on fees (${vat})`);
      expect(body).toContain('₦11,666.25');
      expect(body).not.toContain('{{');
    }
  },
);
it('labels a fixed-price card purchase as a purchase with tax on the item', () => {
  const mail = winnerEmail({
    saleType: 'fixed_price',
    purchaseMethod: 'card',
    invoiceNumber: 'INV-TEST',
    title: 'Synthetic phone',
    lotNumber: 'LOT-TEST',
    hammerKobo: 1000000,
    premiumKobo: 0,
    lotFeeKobo: 0,
    vatKobo: 75000,
    totalKobo: 1075000,
    location: 'Synthetic Lagos hub',
    address: 'Test only',
    status: 'paid',
    deadline: null,
  });
  expect(mail.Subject).toContain('Purchase confirmed');
  expect(mail.HTML).toContain('Fixed item price');
  expect(mail.HTML).toContain('Tax (7.5%)');
  expect(mail.Text).toContain('Paid by card');
  expect(mail.HTML).not.toContain('Winning bid');
});

it('keeps the winner email in sync with the shared token template', () => {
  const generated = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {winnerEmailTemplate} from './packages/ui/emails/winner-email.ts';process.stdout.write(JSON.stringify(winnerEmailTemplate()));",
    ],
    { encoding: 'utf8' },
  );
  expect(JSON.parse(generated)).toEqual(template);
});

it('renders a branded, escaped win receipt with exact fees and a plain-text alternative', () => {
  const mail = winnerEmail({
    invoiceNumber: 'ANG-TEST',
    title: '<script>bad()</script>',
    lotNumber: 'LAG-104',
    hammerKobo: 500000,
    premiumKobo: 75000,
    lotFeeKobo: 30000,
    vatKobo: 7875,
    totalKobo: 612875,
    location: 'Ikeja hub',
    address: '12 Test Road, Lagos',
    status: 'paid',
    deadline: null,
  });
  expect(mail.Subject).toBe('You won LAG-104 — LotVanta');
  expect(mail.HTML).toContain('&lt;script&gt;');
  expect(mail.HTML).not.toContain('<script>');
  expect(mail.HTML).toContain('₦6,128.75');
  expect(mail.Text).toContain('Paid from your wallet');
  expect(mail.HTML).toContain('Service charge');
  expect(mail.Text).not.toContain('Buyer premium');
  expect(mail.HTML).toContain('Schibsted Grotesk');
  expect(mail.HTML).not.toMatch(/https?:\/\//);
});
