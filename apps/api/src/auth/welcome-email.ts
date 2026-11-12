import { z } from 'zod';
import template from './welcome-email.generated.json';

export const WELCOME_TEMPLATE = 'welcome-v1';

// Links point at the buyer site; only https (or local http) is allowed.
const safeUrl = z.url().refine((value) => {
  const u = new URL(value);
  return (
    !u.username &&
    !u.password &&
    (u.protocol === 'https:' ||
      (u.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(u.hostname)))
  );
});

export const welcomeMailSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    browseUrl: safeUrl,
    walletUrl: safeUrl,
  })
  .strict();
export type WelcomeMail = z.input<typeof welcomeMailSchema>;

// What a new buyer's welcome email needs, from the buyer site origin.
export function welcomeMessage(name: string, origin: string): WelcomeMail {
  const base = origin.replace(/\/+$/, '');
  return {
    // Greet by first name; the full name stays private.
    name: name.trim().split(/\s+/)[0] || 'there',
    browseUrl: `${base}/`,
    walletUrl: `${base}/wallet`,
  };
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );

export function welcomeEmail(input: WelcomeMail) {
  const data = welcomeMailSchema.parse(input);
  const values: Record<string, string> = { ...data };
  const render = (source: string, html: boolean) =>
    source.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: 'Welcome to LotVanta. Here’s how it works',
    Text: render(template.text, false),
    HTML: render(template.html, true),
  };
}
