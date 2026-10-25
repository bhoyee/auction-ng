import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { winnerEmail } from '../apps/api/src/closing/winner-email';
import template from '../apps/api/src/closing/winner-email.generated.json';

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
  expect(mail.Subject).toBe('You won LAG-104 — Auction NG');
  expect(mail.HTML).toContain('&lt;script&gt;');
  expect(mail.HTML).not.toContain('<script>');
  expect(mail.HTML).toContain('₦6,128.75');
  expect(mail.Text).toContain('Paid from your wallet');
  expect(mail.HTML).toContain('Buyer premium');
  expect(mail.HTML).toContain('Schibsted Grotesk');
  expect(mail.HTML).not.toMatch(/https?:\/\//);
});
