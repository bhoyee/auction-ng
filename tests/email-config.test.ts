import { expect, it } from 'vitest';
import { parseEnv } from 'node:util';
import { syncEmailConfig } from '../scripts/email-config';

it('syncs only email settings and preserves isolated storage, keys and payments', () => {
  const source =
    'AUTH_MODE=smtp\nSMTP_PASSWORD="synthetic#value"\nSMTP_FROM_NAME=GiddyEdu\nDATA_ENCRYPTION_KEY=main\nPAYSTACK_SECRET_KEY=\n';
  const target =
    '# Demo\nAUTH_MODE=local\nSMTP_PASSWORD=old\nSMTP_PASSWORD=duplicate\nDATA_ENCRYPTION_KEY=demo-key\nDEMO_DATABASE_URL=isolated\nBID_NAMESPACE=isolated\nPAYSTACK_SECRET_KEY=retained\n';
  const result = syncEmailConfig(source, target);
  expect(parseEnv(result)).toMatchObject({
    AUTH_MODE: 'smtp',
    SMTP_PASSWORD: 'synthetic#value',
    SMTP_FROM_NAME: 'GiddyEdu',
    DATA_ENCRYPTION_KEY: 'demo-key',
    DEMO_DATABASE_URL: 'isolated',
    BID_NAMESPACE: 'isolated',
    PAYSTACK_SECRET_KEY: 'retained',
  });
  expect(result.match(/^SMTP_PASSWORD=/gm)).toHaveLength(1);
  expect(syncEmailConfig(source, result)).toBe(result);
});
it('removes stale demo mail credentials and delivery mode when absent from the source', () => {
  const result = parseEnv(
    syncEmailConfig(
      'SMTP_HOST=smtp.resend.com\n',
      'AUTH_MODE=smtp\nSMTP_PASSWORD=old\nRESEND_API_KEY=old\nDEMO_DATABASE_URL=retained\n',
    ),
  );
  expect(result).toEqual({
    SMTP_HOST: 'smtp.resend.com',
    DEMO_DATABASE_URL: 'retained',
  });
});
