import { expect, it } from 'vitest';
import { storageEmail } from '../apps/api/src/pickup/storage-email';
const input = {
  caseId: '550e8400-e29b-41d4-a716-446655440000',
  revision: 1,
  phase: 'ready',
  title: 'Phone <script>alert(1)</script>',
  lotNumber: 'LV8Y4K2P',
  dueAt: '2026-11-13T16:00:00.000Z',
  dailyKobo: 100000,
  capKobo: 1000000,
};
it('escapes product content and shows the exact WAT deadline and disclosed rate/cap', () => {
  const mail = storageEmail(input);
  expect(mail.HTML).not.toContain('<script>');
  expect(mail.Text).toContain('WAT');
  expect(mail.Text).toContain('₦1,000');
  expect(mail.Text).toContain('₦10,000');
  expect(mail.Text).toContain('never charged automatically');
});
it('presents the deadline as a collection window, not an appointment', () => {
  for (const phase of ['ready', 'reminder1', 'reminder2', 'extend']) {
    const mail = storageEmail({ ...input, phase });
    for (const body of [mail.Text, mail.HTML]) {
      expect(body).toContain(
        'Free collection until Friday, 13 November 2026, 5:00pm WAT',
      );
      expect(body).toContain('Collect on any working day before then.');
      expect(body).toContain('After the deadline, storage is ₦1,000');
      expect(body).not.toContain('Collect by');
    }
  }
  const waived = storageEmail({ ...input, phase: 'waive', waived: true });
  expect(waived.Text).toContain(
    'Please collect on or before Friday, 13 November 2026, 5:00pm WAT',
  );
  expect(waived.Text).not.toContain('Free collection until');
});
it('does not threaten new storage charges after a waiver or extension of a waived case', () => {
  for (const phase of ['waive', 'extend']) {
    const mail = storageEmail({ ...input, phase, waived: true });
    expect(mail.HTML).toContain(
      'Unpaid and future storage charges for this item are waived',
    );
    expect(mail.HTML).not.toContain('After the deadline, storage is');
    expect(mail.Text).not.toContain('After the deadline, storage is');
  }
});
