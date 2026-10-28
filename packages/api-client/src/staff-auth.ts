import {
  staffSignInSchema,
  webRefreshSchema,
  tokenResponseSchema,
} from '@auction-ng/shared';
import { ApiError } from './auth';
export function createStaffAuthClient(baseUrl: string, deviceId: string) {
  async function request(path: string, body: unknown) {
    const response = await fetch(new URL(`/auth/staff/${path}`, baseUrl), {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Auction-Client': 'web',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.status === 204 ? undefined : response.json();
  }
  return {
    async signIn(email: string, password: string, code: string) {
      return tokenResponseSchema.parse(
        await request(
          'sign-in',
          staffSignInSchema.parse({
            email,
            password,
            code,
            client: 'web',
            deviceId,
          }),
        ),
      );
    },
    async refresh() {
      return tokenResponseSchema.parse(
        await request(
          'refresh',
          webRefreshSchema.parse({ client: 'web', deviceId }),
        ),
      );
    },
    async logout() {
      await request(
        'logout',
        webRefreshSchema.parse({ client: 'web', deviceId }),
      );
    },
  };
}
