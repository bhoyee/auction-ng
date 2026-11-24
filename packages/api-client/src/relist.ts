import {
  relistSettingsSchema,
  relistSettingsUpdateSchema,
  unsoldBulkRelistSchema,
  unsoldBulkResultSchema,
  unsoldCountSchema,
  unsoldDismissSchema,
  unsoldDismissedPageSchema,
  unsoldPageSchema,
  unsoldRelistResultSchema,
  unsoldRelistSchema,
  unsoldRestoreResultSchema,
  type RelistSettingsUpdate,
  type UnsoldBulkRelist,
  type UnsoldRelistInput,
} from '@auction-ng/shared/relist-schemas';
import { apiErrorFromResponse } from './auth';

// Unsold review and Unsold items settings (owner decisions 2026-11-13).
export function createRelistClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    timeout = 20000,
  ) {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response.json() as Promise<unknown>;
  }
  return {
    async settings() {
      return relistSettingsSchema.parse(
        await request('/admin/relist-settings'),
      );
    },
    async saveSettings(input: RelistSettingsUpdate) {
      return relistSettingsSchema.parse(
        await request(
          '/admin/relist-settings',
          'POST',
          relistSettingsUpdateSchema.parse(input),
        ),
      );
    },
    async unsold(input: { limit?: number; cursor?: string } = {}) {
      const query = new URLSearchParams();
      if (input.limit) query.set('limit', String(input.limit));
      if (input.cursor) query.set('cursor', input.cursor);
      return unsoldPageSchema.parse(
        await request(`/admin/unsold?${query.toString()}`),
      );
    },
    async unsoldCount() {
      return unsoldCountSchema.parse(await request('/admin/unsold/count'));
    },
    // Bulk calls handle items one by one on the server, so allow longer.
    async relistMany(input: UnsoldBulkRelist) {
      return unsoldBulkResultSchema.parse(
        await request(
          '/admin/unsold/relist',
          'POST',
          unsoldBulkRelistSchema.parse(input),
          90000,
        ),
      );
    },
    async dismiss(ids: string[]) {
      return unsoldBulkResultSchema.parse(
        await request(
          '/admin/unsold/dismiss',
          'POST',
          unsoldDismissSchema.parse({ ids }),
          90000,
        ),
      );
    },
    async dismissed(input: { limit?: number; cursor?: string } = {}) {
      const query = new URLSearchParams();
      if (input.limit) query.set('limit', String(input.limit));
      if (input.cursor) query.set('cursor', input.cursor);
      return unsoldDismissedPageSchema.parse(
        await request(`/admin/unsold/dismissed?${query.toString()}`),
      );
    },
    async restore(lotId: string) {
      return unsoldRestoreResultSchema.parse(
        await request(
          `/admin/unsold/${encodeURIComponent(lotId)}/restore`,
          'POST',
        ),
      );
    },
    async relist(lotId: string, input: UnsoldRelistInput) {
      return unsoldRelistResultSchema.parse(
        await request(
          `/admin/unsold/${encodeURIComponent(lotId)}/relist`,
          'POST',
          unsoldRelistSchema.parse(input),
        ),
      );
    },
  };
}
