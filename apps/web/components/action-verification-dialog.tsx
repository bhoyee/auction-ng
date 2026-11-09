'use client';
import { useEffect, useRef, useState } from 'react';
import { createActionVerificationClient } from '@auction-ng/api-client/action-verification';
import { ApiError } from '@auction-ng/api-client/auth';
import type {
  ActionPurpose,
  ActionVerifyChallenge,
  ActionVerifyResult,
} from '@auction-ng/shared/action-verification';
import type { TwoFactorProof } from '@auction-ng/shared/two-factor-schemas';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { OtpInput } from '@auction-ng/ui/web/otp-input';
import { TwoFactorInput } from '@auction-ng/ui/web/two-factor-input';
import { Toast } from '@auction-ng/ui/web/toast';
import { BuyerStack } from '@auction-ng/ui/web/buyer';
import { apiUrl, useBuyer } from '../lib/session';

const copy: Record<ActionPurpose, { title: string; intro: string }> = {
  bidding: {
    title: 'Confirm it’s you to bid',
    intro:
      'For your security, confirm your password and the code we email you. You can then bid for 30 minutes without being asked again.',
  },
  'buy-now': {
    title: 'Confirm it’s you to buy',
    intro:
      'For your security, confirm your password and the code we email you before this purchase.',
  },
  'bid-cancellation': {
    title: 'Confirm it’s you to send this request',
    intro:
      'For your security, confirm your password and the code we email you before sending this cancellation request.',
  },
};

function message(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine)
    return 'You’re offline. Reconnect, then try again.';
  if (!(error instanceof ApiError))
    return 'We couldn’t reach LotVanta. Check your connection and try again.';
  if (error.code === 'TWO_FACTOR_REQUIRED')
    return 'Enter your authenticator or recovery code.';
  if (error.code === 'TWO_FACTOR_INVALID')
    return 'Check your authenticator code or use an unused recovery code.';
  if (error.status === 401) return 'Check your password and try again.';
  if (error.status === 429)
    return 'Too many attempts. Wait a few minutes, then try again.';
  if (error.status === 503)
    return 'We can’t send email codes right now. Try again shortly.';
  return error.message || 'Something went wrong. Try again.';
}

export function ActionVerificationDialog({
  open,
  purpose,
  lotId,
  onVerified,
  onClose,
}: {
  open: boolean;
  purpose: ActionPurpose;
  lotId?: string;
  onVerified: (result: ActionVerifyResult) => void;
  onClose: () => void;
}) {
  const { tokens, deviceId, renewSession } = useBuyer();
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<ActionVerifyChallenge>();
  const [code, setCode] = useState('');
  const [factor, setFactor] = useState<TwoFactorProof>({
    method: 'authenticator',
    code: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);
  const owner = useRef(tokens?.user.id);
  owner.current = tokens?.user.id;

  useEffect(() => {
    if (open) return;
    setPassword('');
    setChallenge(undefined);
    setCode('');
    setFactor({ method: 'authenticator', code: '' });
    setError('');
    setResent(false);
  }, [open]);

  async function call<T>(
    work: (
      client: ReturnType<typeof createActionVerificationClient>,
    ) => Promise<T>,
  ) {
    if (!tokens) throw new Error('Sign in again.');
    const run = (accessToken: string) =>
      work(createActionVerificationClient(apiUrl, { accessToken, deviceId }));
    try {
      return await run(tokens.accessToken);
    } catch (failure) {
      if (!(failure instanceof ApiError) || failure.status !== 401)
        throw failure;
      // A 401 from start can also mean a wrong password; only retry when the
      // session itself was renewed for the same buyer.
      const fresh = await renewSession(tokens.accessToken);
      if (!fresh || fresh.user.id !== tokens.user.id) throw failure;
      return run(fresh.accessToken);
    }
  }

  async function send(again = false) {
    if (busy || !password) return;
    setBusy(true);
    setError('');
    try {
      const next = await call((client) =>
        client.start({ purpose, password, ...(lotId ? { lotId } : {}) }),
      );
      setChallenge(next);
      setCode('');
      setResent(again);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (busy || !challenge || code.length !== 6) return;
    setBusy(true);
    setError('');
    const who = owner.current;
    try {
      const result = await call((client) =>
        client.finish({
          id: challenge.id,
          code,
          ...(challenge.twoFactorRequired ? { factor } : {}),
        }),
      );
      if (owner.current !== who) return;
      setPassword('');
      onVerified(result);
    } catch (failure) {
      setError(message(failure));
      if (failure instanceof ApiError && failure.status === 400) setCode('');
    } finally {
      setBusy(false);
    }
  }

  const factorReady =
    !challenge?.twoFactorRequired || factor.code.trim().length >= 6;

  return (
    <Dialog
      open={open}
      title={copy[purpose].title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <BuyerStack>
        {error && (
          <Toast tone="error" emphasis onClose={() => setError('')}>
            {error}
          </Toast>
        )}
        {!challenge ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <BuyerStack>
              <p>{copy[purpose].intro}</p>
              <PasswordInput
                label="Your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={busy}
              />
              <Button type="submit" busy={busy} disabled={!password}>
                Email me a code
              </Button>
            </BuyerStack>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            <BuyerStack>
              <p>
                {resent ? 'We sent a new code. ' : ''}Enter the six-digit code
                sent to your email. It’s valid for five minutes.
              </p>
              <OtpInput
                label="Email code"
                value={code}
                onValueChange={setCode}
                disabled={busy}
              />
              {challenge.twoFactorRequired && (
                <TwoFactorInput
                  value={factor}
                  onChange={setFactor}
                  disabled={busy}
                />
              )}
              <Button
                type="submit"
                busy={busy}
                disabled={code.length !== 6 || !factorReady}
              >
                Confirm and continue
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void send(true)}
              >
                Send a new code
              </Button>
            </BuyerStack>
          </form>
        )}
      </BuyerStack>
    </Dialog>
  );
}
