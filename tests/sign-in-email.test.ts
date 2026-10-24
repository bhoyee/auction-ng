import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import template from '../apps/api/src/auth/sign-in-email.generated.json';
import { signInEmail } from '../apps/api/src/auth/email-provider';

it('keeps the generated email asset in sync with the design-token template', () => {
  const generated = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { signInEmailTemplate } from './packages/ui/emails/sign-in-email.ts'; process.stdout.write(JSON.stringify(signInEmailTemplate()));",
    ],
    { encoding: 'utf8' },
  );
  expect(JSON.parse(generated)).toEqual(template);
});
it('includes a readable HTML message and matching plain text without remote content', () => {
  const message = signInEmail('012345');
  expect(message.Subject).toBe('Your Auction NG sign-in code');
  for (const content of [message.Text, message.HTML]) {
    expect(content).toContain('012345');
    expect(content).toContain('5 minutes');
    expect(content).toContain(
      'Auction NG staff will never ask you to share it.',
    );
    expect(content).toContain(
      'If you did not request this code, you can ignore this email.',
    );
    expect(content).not.toContain('{{code}}');
  }
  expect(Buffer.byteLength(message.HTML)).toBeLessThan(10000);
  expect(message.HTML).not.toMatch(
    /<script|<img|https?:|gradient|box-shadow|onclick=/i,
  );
});
it.each(['<script>alert(1)</script>', '12345', '1234567', '12 3456', 'abcdef'])(
  'rejects an invalid or injectable code',
  (code) => {
    expect(() => signInEmail(code)).toThrow();
  },
);
