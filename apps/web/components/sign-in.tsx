'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  BuyerPage,
  BuyerPanel,
  BuyerStack,
  Button,
  Input,
  OtpInput,
} from '@auction-ng/ui/web';
import { useBuyer } from '../lib/session';
export function SignIn() {
  const { auth, setTokens } = useBuyer();
  const router = useRouter();
  const [challenge, setChallenge] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth || busy) return;
    setBusy(true);
    setError('');
    try {
      if (!challenge) {
        const result = await auth.requestCode(email);
        setChallenge(result.challengeId);
      } else {
        const result = await auth.verifyCode(challenge, code);
        setTokens(result);
        setCode('');
        router.replace('/account');
      }
    } catch {
      setError(
        challenge
          ? 'The code could not be verified. Check the six digits or request a new code.'
          : 'The code could not be requested. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <BuyerPage
      narrow
      title={challenge ? 'Check your email' : 'Sign in or create an account'}
      description={
        challenge
          ? `If this address can receive a sign-in code, we’ve sent one to ${email}.`
          : 'Use your email to receive a six-digit sign-in code.'
      }
    >
      <BuyerPanel>
        <form onSubmit={(event) => void submit(event)}>
          <BuyerStack>
            {challenge ? (
              <OtpInput
                label="Six-digit code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            ) : (
              <Input
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="chiamaka@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
            {error && <p role="alert">{error}</p>}
            <Button type="submit" busy={busy} disabled={!auth}>
              {challenge ? 'Verify code' : 'Email me a code'}
            </Button>
            {challenge && (
              <Button
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setChallenge('');
                  setCode('');
                  setError('');
                }}
              >
                Use another email or request a new code
              </Button>
            )}
            <p>
              Email sign-in keeps your account accessible. A verified phone and
              enough wallet funds are still required before you can bid.
            </p>
          </BuyerStack>
        </form>
      </BuyerPanel>
    </BuyerPage>
  );
}
