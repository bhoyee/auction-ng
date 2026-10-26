import {
  profileSchema,
  tokenResponseSchema,
  webRefreshSchema,
  type TokenResponse,
} from '@auction-ng/shared/auth-session-schemas';

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`The request failed (${status}).`);
  }
}
export type AuthClientOptions = {
  client: 'web' | 'mobile';
  deviceId: string;
  origin?: string;
};
export function createAuthClient(baseUrl: string, options: AuthClientOptions) {
  async function request(
    path: string,
    method: string,
    body?: unknown,
    accessToken?: string,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-Id': options.deviceId,
    };
    if (options.client === 'web') headers['X-Auction-Client'] = 'web';
    if (options.origin) headers.Origin = options.origin;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(new URL(`/auth/${path}`, baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: options.client === 'web' ? 'include' : 'omit',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.status === 204 ? undefined : response.json();
  }
  const device = { client: options.client, deviceId: options.deviceId };
  const refreshInput = async (refreshToken?: string) => {
    if (options.client === 'web') return webRefreshSchema.parse(device);
    const { refreshSchema } = await import('@auction-ng/shared/auth-schemas');
    return refreshSchema.parse({ ...device, refreshToken });
  };
  function tokens(value: unknown): TokenResponse {
    const result = tokenResponseSchema.parse(value);
    if (options.client === 'mobile' && !result.refreshToken)
      throw new Error('Mobile refresh token missing.');
    return result;
  }
  return {
    async requestCode(email: string) {
      const { codeRequestedSchema, requestCodeSchema } =
        await import('@auction-ng/shared/auth-schemas');
      return codeRequestedSchema.parse(
        await request(
          'request-code',
          'POST',
          requestCodeSchema.parse({ ...device, email }),
        ),
      );
    },
    async verifyCode(challengeId: string, code: string) {
      const { verifyCodeSchema } =
        await import('@auction-ng/shared/auth-schemas');
      return tokens(
        await request(
          'verify-code',
          'POST',
          verifyCodeSchema.parse({ ...device, challengeId, code }),
        ),
      );
    },
    async refresh(refreshToken?: string) {
      return tokens(
        await request('refresh', 'POST', await refreshInput(refreshToken)),
      );
    },
    async logout(refreshToken?: string) {
      await request('logout', 'POST', await refreshInput(refreshToken));
    },
    async getProfile(accessToken: string) {
      return profileSchema.parse(
        await request('profile', 'GET', undefined, accessToken),
      );
    },
    async updateProfile(accessToken: string, name: string) {
      const { profilePatchSchema } =
        await import('@auction-ng/shared/auth-schemas');
      return profileSchema.parse(
        await request(
          'profile',
          'PATCH',
          profilePatchSchema.parse({ name }),
          accessToken,
        ),
      );
    },
  };
}
