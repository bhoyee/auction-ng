'use client';
import { useState } from 'react';
import type { TokenResponse } from '@auction-ng/shared';
import { createStaffAuthClient } from '@auction-ng/api-client/staff-auth';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { BuyerStack } from '@auction-ng/ui/web/buyer';
import { Input } from '@auction-ng/ui/web/input';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { OtpInput } from '@auction-ng/ui/web/otp-input';
import { Toast } from '@auction-ng/ui/web/toast';
export function StaffRecovery({
  baseUrl,
  deviceId,
  onSession,
}: {
  baseUrl: string;
  deviceId: string;
  onSession: (value: TokenResponse) => void;
}) {
  const [open, setOpen] = useState(false),
    [id, setId] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [recovery, setRecovery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const close = () => {
    if (busy) return;
    setOpen(false);
    setId('');
    setPassword('');
    setCode('');
    setRecovery('');
    setError('');
  };
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Lost access to your authenticator?
      </Button>
      <Dialog open={open} title="Use a staff recovery code" onClose={close}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            void (async () => {
              const client = createStaffAuthClient(baseUrl, deviceId);
              if (!id) {
                const challenge = await client.recoveryStart(email, password);
                setId(challenge.challengeId);
                setPassword('');
              } else {
                const session = await client.recoveryVerify(id, code, recovery);
                setCode('');
                setRecovery('');
                setOpen(false);
                setId('');
                onSession(session);
              }
            })()
              .catch(() =>
                setError(
                  'Recovery could not be completed. Check your details and unused recovery code. Email codes expire after five minutes.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <BuyerStack>
            {error && (
              <Toast emphasis tone="error" onClose={() => setError('')}>
                {error}
              </Toast>
            )}
            <p>
              Recovery requires your password, a security code sent to your
              verified email and one unused recovery code. Staff authenticator
              protection remains enabled.
            </p>
            {!id ? (
              <>
                <Input
                  label="Staff email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  required
                />
                <PasswordInput
                  label="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </>
            ) : (
              <>
                <OtpInput
                  label="Email security code"
                  value={code}
                  onValueChange={setCode}
                  required
                />
                <Input
                  label="Single-use recovery code"
                  value={recovery}
                  onChange={(event) =>
                    setRecovery(event.target.value.toUpperCase())
                  }
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={29}
                  required
                />
              </>
            )}
            <Button type="submit" busy={busy}>
              {id ? 'Verify and sign in' : 'Send security code'}
            </Button>
          </BuyerStack>
        </form>
      </Dialog>
    </>
  );
}
