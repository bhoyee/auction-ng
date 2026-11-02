import { expect, it } from 'vitest';
import { preBidEmail } from '../apps/api/src/prebids/prebid-email';
it('shows the exact released amount and escapes user-visible text in both email formats', () => {
  const mail = preBidEmail({
    lotNumber: 'AB12CD34',
    title: 'Phone <script>unsafe</script>',
    reason: 'The launch time changed. Reserved funds have been released.',
    releasedKobo: 1193500,
  });
  expect(mail.Subject).toContain('Pre-bid cancelled');
  expect(mail.Text).toContain('₦11,935');
  expect(mail.HTML).toContain('₦11,935');
  expect(mail.HTML).toContain('&lt;script&gt;');
  expect(mail.HTML).not.toContain('<script>');
  expect(mail.HTML).toContain('Schibsted Grotesk');
  expect(mail.HTML).not.toContain('{{');
});
