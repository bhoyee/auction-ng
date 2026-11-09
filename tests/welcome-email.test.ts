import { expect, it } from 'vitest';
import {
  welcomeEmail,
  welcomeMessage,
} from '../apps/api/src/auth/welcome-email';

it('greets by first name and explains the three steps with safe links', () => {
  const mail = welcomeEmail(
    welcomeMessage('Chiamaka Obi', 'https://beta.lotvanta.ng/'),
  );
  expect(mail.Subject).toBe('Welcome to LotVanta. Here’s how it works');
  for (const body of [mail.Text, mail.HTML]) {
    expect(body).toContain('Hi Chiamaka,');
    expect(body).not.toContain('Obi');
    expect(body).toContain('Add money to your wallet');
    expect(body).toContain('Bid on what you want');
    expect(body).toContain('Win and collect');
    expect(body).toContain('within 5 working days');
    expect(body).toContain('only charged if you win');
    expect(body).toContain('https://beta.lotvanta.ng/wallet');
    expect(body).toContain('never ask for your password');
    // Nothing that is not live yet.
    expect(body).not.toMatch(/delivery|app store|google play/i);
  }
  expect(mail.HTML).toContain('cid:lotvanta-brand-logo');
});

it('escapes names in the HTML and refuses unsafe links', () => {
  const mail = welcomeEmail({
    name: '<b>Ada</b>',
    browseUrl: 'https://beta.lotvanta.ng/',
    walletUrl: 'https://beta.lotvanta.ng/wallet',
  });
  expect(mail.HTML).toContain('&lt;b&gt;Ada&lt;/b&gt;');
  expect(mail.HTML).not.toContain('<b>Ada</b>');
  expect(() =>
    welcomeEmail({
      name: 'Ada',
      browseUrl: 'javascript:alert(1)',
      walletUrl: 'https://beta.lotvanta.ng/wallet',
    }),
  ).toThrow();
});
