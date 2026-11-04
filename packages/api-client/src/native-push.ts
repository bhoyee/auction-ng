import {
  nativePushRegisterSchema,
  nativePushStatusSchema,
  type NativePushRegister,
} from '@auction-ng/shared/native-push-schemas';
import { apiErrorFromResponse } from './auth';
export function createNativePushClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  const request = async (path: string, body: unknown) => {
    const response = await fetch(
      new URL('/buyers/push-devices' + path, baseUrl),
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + credentials.accessToken,
          'X-Device-Id': credentials.deviceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw await apiErrorFromResponse(response);
    return nativePushStatusSchema.parse(await response.json());
  };
  return {
    register: (input: NativePushRegister) =>
      request('', nativePushRegisterSchema.parse(input)),
    disable: () => request('/disable', {}),
  };
}
