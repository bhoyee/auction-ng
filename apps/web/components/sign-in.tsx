'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BuyerStack } from '@auction-ng/ui/web/buyer';
import { FormError } from '@auction-ng/ui/web/form-error';
import { Button } from '@auction-ng/ui/web/button';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { Input } from '@auction-ng/ui/web/input';
import { OtpInput } from '@auction-ng/ui/web/otp-input';
import { AuthLayout } from '@auction-ng/ui/web/marketplace-sections';
import { ApiError } from '@auction-ng/api-client/auth';
import { useBuyer } from '../lib/session';
import { safeBuyerReturnPath } from '../lib/return-path';
export function SignIn({
  signup = false,
  forgot = false,
}: {
  signup?: boolean;
  forgot?: boolean;
}) {
  const { auth, tokens, ready, setTokens } = useBuyer();
  const router = useRouter();
  const [challenge, setChallenge] = useState(''),
    [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [website, setWebsite] = useState(''),
    [errorVersion, setErrorVersion] = useState(0);
  const dismissError = useCallback(() => setError(''), []);
  const showError = (message: string) => {
    setError(message);
    setErrorVersion((value) => value + 1);
  };
  const next = () =>
    safeBuyerReturnPath(
      new URLSearchParams(window.location.search).get('next'),
    );
  useEffect(() => {
    if (ready && tokens && !challenge && !forgot)
      router.replace(
        safeBuyerReturnPath(
          new URLSearchParams(window.location.search).get('next'),
        ),
      );
  }, [ready, tokens, challenge, forgot, router]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth || busy) return;
    setError('');
    if ((signup || (forgot && challenge)) && password !== confirm) {
      showError('The passwords do not match. Enter them again.');
      return;
    }
    setBusy(true);
    try {
      if (!challenge) {
        const result = await auth.requestCode(
          email,
          forgot ? undefined : password,
          forgot ? 'reset' : signup ? 'signup' : 'login',
          name,
          website,
        );
        setChallenge(result.challengeId);
        setPassword('');
        setConfirm('');
      } else if (forgot) {
        await auth.resetPassword(challenge, code, password);
        setTokens(null);
        setPassword('');
        setConfirm('');
        setCode('');
        setDone(true);
      } else {
        const result = await auth.verifyCode(challenge, code);
        setTokens(result);
        setCode('');
        router.replace(next());
      }
    } catch (error) {
      showError(
        error instanceof ApiError && error.status === 429
          ? 'Too many attempts. Wait 15 minutes before trying again.'
          : challenge
            ? 'The code could not be verified. Check it or request a new code.'
            : signup
              ? 'We could not continue. Check your details and connection. If you already have an account, sign in or reset your password.'
              : forgot
                ? 'We could not request a code. Check your connection and try again.'
                : error instanceof ApiError && error.status === 401
                  ? 'Invalid email or password.'
                  : 'We could not sign you in. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout
      title={
        done
          ? 'Password updated'
          : challenge
            ? 'Check your email'
            : forgot
              ? 'Reset your password'
              : signup
                ? 'Create your account'
                : 'Welcome back.'
      }
      description={
        done
          ? 'Your password has been saved and previous sessions have been signed out. Sign in with your new password.'
          : challenge
            ? forgot
              ? `If an active account exists for ${email}, a recovery code will arrive shortly. It expires in five minutes.`
              : signup
                ? `If this email is available, a code will arrive at ${email}. If you already have an account, sign in instead.`
                : `Enter the six-digit code sent to ${email}. It expires in five minutes.`
            : forgot
              ? 'Use your verified email to reset your password, or set your first password if you already have an account.'
              : signup
                ? 'A strong password and email verification protect your account.'
                : 'Enter your email and password. Then confirm the code we send to your email.'
      }
    >
      {done ? (
        <a className="agn-button agn-button--primary" href="/sign-in">
          Sign in
        </a>
      ) : (
        <form
          onSubmit={(event) => void submit(event)}
          onInvalidCapture={(event) => {
            event.preventDefault();
            const input = event.target;
            if (input instanceof HTMLInputElement)
              showError(
                input.validity.valueMissing
                  ? 'Complete all required fields before continuing.'
                  : input.validity.typeMismatch
                    ? 'Enter a valid email address.'
                    : input.validity.tooShort
                      ? 'Use at least 12 characters for your password.'
                      : input.validationMessage,
              );
          }}
        >
          <BuyerStack>
            {error && (
              <FormError
                key={errorVersion}
                message={error}
                onDismiss={dismissError}
              />
            )}
            {signup && !challenge && (
              <label className="agn-auth-trap" aria-hidden="true">
                Company website
                <input
                  name="company_website"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            )}
            {!challenge && (
              <>
                {signup && (
                  <Input
                    label="Full name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={1}
                    maxLength={120}
                    required
                  />
                )}
                <Input
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </>
            )}
            {challenge && (
              <OtpInput
                label="Six-digit code"
                value={code}
                onValueChange={setCode}
                required
              />
            )}
            {((!challenge && !forgot) || (challenge && forgot)) && (
              <PasswordInput
                label={forgot ? 'New password' : 'Password'}
                autoComplete={
                  signup || forgot ? 'new-password' : 'current-password'
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={12}
                maxLength={128}
                hint={
                  signup || forgot
                    ? 'Use at least 12 characters. A long, unique passphrase is easier to remember.'
                    : undefined
                }
                required
              />
            )}
            {((signup && !challenge) || (forgot && challenge)) && (
              <PasswordInput
                label="Confirm password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                minLength={12}
                maxLength={128}
                required
              />
            )}
            <Button type="submit" busy={busy} disabled={!auth}>
              {challenge
                ? forgot
                  ? 'Save new password'
                  : 'Verify and sign in'
                : forgot
                  ? 'Send recovery code'
                  : signup
                    ? 'Create account'
                    : 'Continue securely'}
            </Button>
            {challenge && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setChallenge('');
                  setCode('');
                  setPassword('');
                  setConfirm('');
                  setError('');
                }}
              >
                Go back or request a new code
              </Button>
            )}
            {!signup && !forgot && !challenge && (
              <a className="agn-auth-inline-link" href="/forgot-password">
                Forgot password or need to set one?
              </a>
            )}
            <p>
              {signup ? 'Already have an account?' : 'New to Auction NG?'}{' '}
              <a
                className="agn-auth-inline-link"
                href={signup ? '/sign-in' : '/sign-up'}
                onClick={(event) => {
                  event.preventDefault();
                  router.push(
                    `${signup ? '/sign-in' : '/sign-up'}?${new URLSearchParams({ next: next() })}`,
                  );
                }}
              >
                {signup ? 'Sign in' : 'Create an account'}
              </a>
            </p>
            {forgot && (
              <a className="agn-auth-inline-link" href="/sign-in">
                Back to sign in
              </a>
            )}
          </BuyerStack>
        </form>
      )}
    </AuthLayout>
  );
}
