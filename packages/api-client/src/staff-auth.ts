import {
  staffSignInSchema,
  webRefreshSchema,
  tokenResponseSchema,
  codeRequestedSchema,
  staffRecoveryStartSchema,
  staffRecoveryVerifySchema,
  staffPasswordChangeSchema,
  staffSessionStateSchema,
  type StaffPasswordChange,
} from '@auction-ng/shared';
import { apiErrorFromResponse } from './auth';
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
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response.status === 204 ? undefined : response.json();
  }
  return {
    async session(accessToken: string, activity = false) {
      const response = await fetch(
        new URL(`/auth/staff/${activity ? 'activity' : 'session'}`, baseUrl),
        {
          method: activity ? 'POST' : 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Device-Id': deviceId,
            'X-Auction-Client': 'web',
            ...(activity ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(activity ? { body: '{}' } : {}),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw await apiErrorFromResponse(response);
      return staffSessionStateSchema.parse(await response.json());
    },
    async changePassword(accessToken: string, value: StaffPasswordChange) {
      const response = await fetch(
        new URL('/auth/staff/change-password', baseUrl),
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'X-Auction-Client': 'web',
            'X-Device-Id': deviceId,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(staffPasswordChangeSchema.parse(value)),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw await apiErrorFromResponse(response);
    },
    async recoveryStart(email: string, password: string) {
      return codeRequestedSchema.parse(
        await request(
          'recovery/start',
          staffRecoveryStartSchema.parse({
            email,
            password,
            deviceId,
            client: 'web',
          }),
        ),
      );
    },
    async recoveryVerify(
      challengeId: string,
      code: string,
      recoveryCode: string,
    ) {
      return tokenResponseSchema.parse(
        await request(
          'recovery/verify',
          staffRecoveryVerifySchema.parse({
            challengeId,
            code,
            recoveryCode,
            deviceId,
            client: 'web',
          }),
        ),
      );
    },
    async signIn(email: string, password: string, code = '') {
      return tokenResponseSchema.parse(
        await request(
          'sign-in',
          staffSignInSchema.parse({
            email,
            password,
            ...(code ? { code } : {}),
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
