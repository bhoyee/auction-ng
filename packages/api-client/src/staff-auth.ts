import {
  staffSignInSchema,
  staffSignInVerifySchema,
  staffSignInChallengeSchema,
  webRefreshSchema,
  tokenResponseSchema,
  codeRequestedSchema,
  staffRecoveryStartSchema,
  staffRecoveryVerifySchema,
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
    // Step 1: password. The server emails a six-digit code.
    async signIn(email: string, password: string) {
      return staffSignInChallengeSchema.parse(
        await request(
          'sign-in',
          staffSignInSchema.parse({
            email,
            password,
            client: 'web',
            deviceId,
          }),
        ),
      );
    },
    // Step 2: the email code, plus the authenticator code when 2FA is on.
    async verifySignIn(
      challengeId: string,
      code: string,
      authenticatorCode = '',
    ) {
      return tokenResponseSchema.parse(
        await request(
          'sign-in/verify',
          staffSignInVerifySchema.parse({
            challengeId,
            code,
            ...(authenticatorCode ? { authenticatorCode } : {}),
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
