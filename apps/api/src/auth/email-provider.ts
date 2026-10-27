import { MailpitDelivery } from '../email/mail-delivery';
import signInTemplate from './sign-in-email.generated.json';

export function signInEmail(code: string) {
  if (!/^\d{6}$/.test(code))
    throw new RangeError('A six-digit sign-in code is required.');
  return {
    Subject: signInTemplate.subject,
    Text: signInTemplate.text.replaceAll('{{code}}', code),
    HTML: signInTemplate.html.replaceAll('{{code}}', code),
  };
}

export interface EmailProvider {
  sendCode(email: string, code: string): Promise<void>;
}

export class MailpitEmailProvider implements EmailProvider {
  private readonly delivery: MailpitDelivery;
  constructor(baseUrl: string) {
    this.delivery = new MailpitDelivery(baseUrl);
  }
  sendCode(email: string, code: string): Promise<void> {
    return this.delivery.send(email, signInEmail(code));
  }
}
