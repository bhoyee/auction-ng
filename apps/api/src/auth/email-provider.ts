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
  private readonly baseUrl: URL;
  constructor(baseUrl: string) {
    this.baseUrl = new URL(baseUrl);
    if (
      !['localhost', '127.0.0.1', 'mailpit'].includes(this.baseUrl.hostname) ||
      this.baseUrl.protocol !== 'http:' ||
      this.baseUrl.username ||
      this.baseUrl.password
    )
      throw new Error('The development inbox must be a local Mailpit service.');
  }
  async sendCode(email: string, code: string): Promise<void> {
    const response = await fetch(new URL('/api/v1/send', this.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        From: { Email: 'login@auction-ng.test', Name: 'Auction NG' },
        To: [{ Email: email }],
        ...signInEmail(code),
      }),
    });
    if (!response.ok) throw new Error('Development email delivery failed.');
  }
}
