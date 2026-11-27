import {
  buyerNotificationPageSchema,
  buyerNotificationSummarySchema,
  buyerNotificationReadInputSchema,
  buyerNotificationReadResultSchema,
} from '@auction-ng/shared/buyer-notification-schemas';
import {
  pageInputSchema,
  type PageInput,
} from '@auction-ng/shared/page-schemas';
import { ApiError } from './auth';
export {
  createForegroundMessageTracker,
  FOREGROUND_MESSAGE_DISPLAY_MS,
  FOREGROUND_MESSAGE_POLL_MS,
  foregroundMessageCopy,
  type ForegroundMessage,
} from '@auction-ng/shared/foreground-messages';

/** Header presence must not download invoice, pre-bid and watch-history code. */
export function createBuyerNotificationClient(
  baseUrl: string,
  options: { accessToken: string; deviceId: string },
) {
  const request = async (
    path: string,
    query?: PageInput,
    body?: unknown,
  ): Promise<unknown> => {
    const url = new URL('/buyers/' + path, baseUrl);
    if (query) {
      const page = pageInputSchema.parse(query);
      url.searchParams.set('limit', String(page.limit));
      if (page.cursor) url.searchParams.set('cursor', page.cursor);
    }
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
        'X-Device-Id': options.deviceId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  };
  return {
    async notificationSummary() {
      return buyerNotificationSummarySchema.parse(
        await request('notifications/summary'),
      );
    },
    async notifications(page: PageInput = {}) {
      return buyerNotificationPageSchema.parse(
        await request('notifications', page),
      );
    },
    async bidderMessages(page: PageInput = {}) {
      return buyerNotificationPageSchema.parse(
        await request('notifications/messages', page),
      );
    },
    async readNotifications(ids: string[]) {
      return buyerNotificationReadResultSchema.parse(
        await request(
          'notifications/read',
          undefined,
          buyerNotificationReadInputSchema.parse({ ids }),
        ),
      );
    },
  };
}
