import {
  type SecurityStart,
  type SecurityEmail,
  type SecurityFinish,
  securityStartSchema,
  securityEmailSchema,
  securityFinishSchema,
  securityStatusSchema,
  securityChallengeSchema,
  securityEmailResultSchema,
  securityResultSchema,
} from '@auction-ng/shared/two-factor-schemas';
import { apiErrorFromResponse } from './auth';
export function createTwoFactorClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(path = '', body?: unknown) {
    const response = await fetch(new URL('/auth/security' + path, baseUrl), {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response.json();
  }
  return {
    async status() {
      return securityStatusSchema.parse(await request());
    },
    async start(input: SecurityStart) {
      return securityChallengeSchema.parse(
        await request('/start', securityStartSchema.parse(input)),
      );
    },
    async email(input: SecurityEmail) {
      return securityEmailResultSchema.parse(
        await request('/email', securityEmailSchema.parse(input)),
      );
    },
    async finish(input: SecurityFinish) {
      return securityResultSchema.parse(
        await request('/finish', securityFinishSchema.parse(input)),
      );
    },
  };
}
