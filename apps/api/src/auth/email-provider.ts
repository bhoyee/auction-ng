import { MailpitDelivery } from '../email/mail-delivery';
import signInTemplate from './sign-in-email.generated.json';

export function signInEmail(
  code: string,
  purpose: 'login' | 'signup' | 'reset' = 'login',
) {
  if (!/^\d{6}$/.test(code))
    throw new RangeError('A six-digit sign-in code is required.');
  const template =
    purpose === 'login'
      ? signInTemplate
      : Object.fromEntries(
          Object.entries(signInTemplate).map(([key, value]) => [
            key,
            value
              .replaceAll(
                'Your sign-in code',
                purpose === 'reset'
                  ? 'Reset your Auction NG password'
                  : 'Verify your email address',
              )
              .replaceAll(
                'Your Auction NG sign-in code',
                purpose === 'reset'
                  ? 'Reset your Auction NG password'
                  : 'Verify your Auction NG email',
              )
              .replaceAll('sign-in email', 'security email')
              .replaceAll(
                'to sign in',
                purpose === 'reset'
                  ? 'to reset your password'
                  : 'to verify your email',
              ),
          ]),
        );
  return {
    Subject: template.subject ?? signInTemplate.subject,
    Text: (template.text ?? signInTemplate.text).replaceAll('{{code}}', code),
    HTML: (template.html ?? signInTemplate.html).replaceAll('{{code}}', code),
  };
}

export interface EmailProvider {
  sendCode(
    email: string,
    code: string,
    purpose?: 'login' | 'signup' | 'reset',
  ): Promise<void>;
}

export class MailpitEmailProvider implements EmailProvider {
  private readonly delivery: MailpitDelivery;
  constructor(baseUrl: string) {
    this.delivery = new MailpitDelivery(baseUrl);
  }
  sendCode(
    email: string,
    code: string,
    purpose: 'login' | 'signup' | 'reset' = 'login',
  ): Promise<void> {
    return this.delivery.send(email, signInEmail(code, purpose));
  }
}
