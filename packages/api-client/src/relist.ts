import {
  relistSettingsSchema,
  relistSettingsUpdateSchema,
  unsoldCountSchema,
  unsoldPageSchema,
  unsoldRelistResultSchema,
  unsoldRelistSchema,
  type RelistSettingsUpdate,
  type UnsoldRelistInput,
} from '@auction-ng/shared/relist-schemas';
import { apiErrorFromResponse } from './auth';

// Unsold review and Unsold items settings (owner decisions 2026-11-13).
export function createRelistClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
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
