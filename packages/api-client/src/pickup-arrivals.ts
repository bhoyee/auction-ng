import {
  arrivalInputSchema,
  arrivalUpdateSchema,
  arrivalPageInputSchema,
  arrivalPageSchema,
  arrivalSchema,
} from '@auction-ng/shared/pickup-arrival-schemas';
import type {
  PickupArrivalInput,
  PickupArrivalUpdate,
} from '@auction-ng/shared/pickup-arrival-schemas';
import { ApiError } from './auth';
export function createArrivalClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(path: string, body?: unknown) {
    const response = await fetch(new URL(`/pickup/${path}`, baseUrl), {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }
  return {
    async checkIn(input: PickupArrivalInput) {
      return arrivalSchema.parse(
        await request('check-in', arrivalInputSchema.parse(input)),
      );
    },
    async list(staff = false, page: { limit?: number; cursor?: string } = {}) {
      const parsed = arrivalPageInputSchema.parse(page),
        query = new URLSearchParams({ limit: String(parsed.limit) });
      if (parsed.cursor) query.set('cursor', parsed.cursor);
      return arrivalPageSchema.parse(
        await request(`${staff ? 'staff/' : ''}arrivals?${query}`),
      );
    },
    async update(id: string, input: PickupArrivalUpdate) {
      return arrivalSchema.parse(
        await request(
          `staff/arrivals/${encodeURIComponent(id)}`,
          arrivalUpdateSchema.parse(input),
        ),
      );
    },
  };
}
