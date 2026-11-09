import type { AuthService } from '../src/auth/auth-service';

type Input = {
  email: string;
  password: string;
  deviceId: string;
  client: 'web';
  // Authenticator code, for accounts that enabled 2FA.
  code?: string;
};

// Runs both staff sign-in steps: password, then the emailed code (plus the
// authenticator code when given), reading the code from the test inbox.
export function createStaffSignIn(
  auth: () => AuthService,
  inbox: () => Map<string, string>,
) {
  return async function staffSignIn(input: Input, ip: string) {
    const { code, ...first } = input;
    inbox().delete(input.email);
    const challenge = await auth().staffSignIn(first, ip);
    const emailCode = inbox().get(input.email);
    if (!emailCode) throw new Error('No staff sign-in code was sent.');
    return auth().staffSignInVerify(
      {
        challengeId: challenge.challengeId,
        code: emailCode,
        ...(code ? { authenticatorCode: code } : {}),
        deviceId: input.deviceId,
        client: 'web',
      },
      ip,
    );
  };
}
