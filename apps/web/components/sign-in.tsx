'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BuyerStack } from '@auction-ng/ui/web/buyer';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { OtpInput } from '@auction-ng/ui/web/otp-input';
import { AuthLayout } from '@auction-ng/ui/web/marketplace-sections';
import { useBuyer } from '../lib/session';
import { safeBuyerReturnPath } from '../lib/return-path';
export function SignIn({ signup = false }: { signup?: boolean }) {
  const { auth, tokens, ready, setTokens, updateUser } = useBuyer();
  const router = useRouter();
  const [challenge, setChallenge] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [profileStep, setProfileStep] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    if (ready && tokens && !profileStep && !challenge)
      router.replace(
        safeBuyerReturnPath(
          new URLSearchParams(window.location.search).get('next'),
        ),
      );
  }, [ready, tokens, profileStep, challenge, router]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth || busy) return;
    setBusy(true);
    setError('');
    try {
      if (profileStep && tokens) {
        const user = await auth.updateProfile(tokens.accessToken, name);
        updateUser(user);
        router.replace(
          safeBuyerReturnPath(
            new URLSearchParams(window.location.search).get('next'),
          ),
        );
      } else if (!challenge) {
        const result = await auth.requestCode(email);
        setChallenge(result.challengeId);
      } else {
        const result = await auth.verifyCode(challenge, code);
        setTokens(result);
        setCode('');
        if (signup) {
          setName(result.user.name);
          setProfileStep(true);
        } else
          router.replace(
            safeBuyerReturnPath(
              new URLSearchParams(window.location.search).get('next'),
            ),
          );
      }
    } catch {
      setError(
        profileStep
          ? 'Your name could not be saved. Check your connection and try again.'
          : challenge
            ? 'The code could not be verified. Check the six digits or request a new code.'
            : 'The code could not be requested. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout
      title={
        profileStep
          ? 'What should we call you?'
          : challenge
            ? 'Check your email'
            : signup
              ? 'Your next great find starts here.'
              : 'Welcome back.'
      }
      description={
        profileStep
          ? 'Add your name to finish creating your account.'
          : challenge
            ? `If this address can receive a sign-in code, we’ve sent one to ${email}.`
            : signup
              ? 'Create your Auction NG account with a secure email code. No password to remember.'
              : 'Sign in with a secure code sent to your email.'
      }
      image={
        <>
          <img
            src="/demo/electronics-thumb.webp"
            width={180}
            height={135}
            alt="Demo headphones"
          />
          <img
            src="/demo/furniture-thumb.webp"
            width={180}
            height={135}
            alt="Demo dining chair"
          />
          <img
            src="/demo/tools-thumb.webp"
            width={180}
            height={135}
            alt="Demo cordless drill"
          />
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)}>
        <BuyerStack>
          {profileStep ? (
            <Input
              label="Your name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={1}
              maxLength={120}
              required
            />
          ) : challenge ? (
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
            {profileStep
              ? 'Create my account'
              : challenge
                ? 'Verify code'
                : 'Email me a code'}
          </Button>
          {challenge && !profileStep && (
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
          {!profileStep && (
            <p>
              {signup ? 'Already have an account?' : 'New here?'}{' '}
              <a
                className="agn-auth-inline-link"
                href={signup ? '/sign-in' : '/sign-up'}
                onClick={(event) => {
                  event.preventDefault();
                  const next = safeBuyerReturnPath(
                    new URLSearchParams(window.location.search).get('next'),
                  );
                  router.push(
                    `${signup ? '/sign-in' : '/sign-up'}?${new URLSearchParams({ next })}`,
                  );
                }}
              >
                {signup ? 'Sign in' : 'Create an account'}
              </a>
            </p>
          )}
        </BuyerStack>
      </form>
    </AuthLayout>
  );
}
