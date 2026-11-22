import { z } from 'zod';

/**
 * Sends a short text to the admin's phone (owner decision 2026-11-21).
 * CallMeBot is the first implementation; the WhatsApp Business API can
 * replace it behind this interface.
 */
export interface AdminAlertProvider {
  send(text: string): Promise<void>;
}

export class AdminAlertError extends Error {
  override name = 'AdminAlertError';
}

const configSchema = z.object({
  ADMIN_WHATSAPP_PHONE: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  CALLMEBOT_API_KEY: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/),
});

/** WhatsApp through CallMeBot's free API; the key belongs to that phone. */
export class CallMeBotProvider implements AdminAlertProvider {
  constructor(
    private readonly phone: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async send(text: string) {
    const url = new URL('https://api.callmebot.com/whatsapp.php');
    url.searchParams.set('phone', this.phone);
    url.searchParams.set('text', text);
    url.searchParams.set('apikey', this.apiKey);
    // The URL carries the API key: never log it or the provider's response.
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AdminAlertError('WhatsApp alert provider unreachable.');
    }
    const body = await response.text().catch(() => '');
    // CallMeBot answers 200 with an HTML note when it queues a message. A
    // paused account gets 208 and "This request has been ignored (no message
    // will be sent)" (seen 2026-11-21), so only a plain 200 without an error
    // note counts as sent.
    if (
      response.status !== 200 ||
      /invalid|error|not (?:active|allowed|registered)|blocked|paused|disabled|ignored|no message will be sent/i.test(
        body,
      )
    )
      throw new AdminAlertError('WhatsApp alert was not accepted.');
  }
}

/** Off unless both settings are present and well formed. */
export function createAdminAlertProvider(
  env: Record<string, string | undefined> = process.env,
): AdminAlertProvider | undefined {
  const parsed = configSchema.safeParse({
    ADMIN_WHATSAPP_PHONE: env.ADMIN_WHATSAPP_PHONE?.trim(),
    CALLMEBOT_API_KEY: env.CALLMEBOT_API_KEY?.trim(),
  });
  if (!parsed.success) return undefined;
  return new CallMeBotProvider(
    parsed.data.ADMIN_WHATSAPP_PHONE,
    parsed.data.CALLMEBOT_API_KEY,
  );
}

export const adminAlertsEnabled = (
  env: Record<string, string | undefined> = process.env,
) => createAdminAlertProvider(env) !== undefined;
