'use client';
import { useEffect, useRef, useState } from 'react';
import { createStaffEnrollmentClient } from '@auction-ng/api-client/staff-admin';
import { BrandLogo } from '@auction-ng/ui/web/brand-logo';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { Button } from '@auction-ng/ui/web/button';
import {
  Check,
  CircleAlert,
  CircleCheck,
  KeyRound,
  LogIn,
  Mail,
} from '@auction-ng/ui/web/icons';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const MIN_LENGTH = 15;

/** Left panel: what this page is and the three steps. */
function EnrollmentBrand() {
  return (
    <aside className="lv-staff-login-brand" aria-label="GiddyDeal staff portal">
      <div className="lv-staff-login-logo">
        <BrandLogo />
      </div>
      <div>
        <h2>Welcome to the GiddyDeal staff team.</h2>
        <ul>
          <li>
            <Mail size={20} aria-hidden="true" /> Open the link from your
            invitation email
          </li>
          <li>
            <KeyRound size={20} aria-hidden="true" /> Choose your private
            password
          </li>
          <li>
            <LogIn size={20} aria-hidden="true" /> Sign in to the staff
            workspace
          </li>
        </ul>
      </div>
      <p>Your password is private. GiddyDeal staff will never ask for it.</p>
    </aside>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('en-NG') ?? '')
    .join('');
}

export function StaffEnrollment() {
  const [token, setToken] = useState(''),
    [state, setState] = useState<'checking' | 'invalid' | 'ready' | 'complete'>(
      'checking',
    ),
    [setup, setSetup] = useState<{ name: string; email: string }>(),
    [password, setPassword] = useState(''),
    [repeat, setRepeat] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // Read once: development runs effects twice, and the link is cleared
  // from the address bar after the first read.
  const link = useRef<string | null>(null);

  // The link is read once, then removed from the address bar and history.
  useEffect(() => {
    link.current ??= window.location.hash.slice(1);
    const value = link.current;
    window.history.replaceState(null, '', '/enroll');
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
      setState('invalid');
      return;
    }
    setToken(value);
    let active = true;
    createStaffEnrollmentClient(api)
      .start(value)
      .then((details) => {
        if (!active) return;
        setSetup(details);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('invalid');
      });
    return () => {
      active = false;
    };
  }, []);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = repeat.length > 0 && password === repeat;

  async function finish() {
    if (!longEnough) {
      setError(`Use at least ${MIN_LENGTH} characters for your password.`);
      return;
    }
    if (!matches) {
      setError('The two passwords don’t match. Type the same password twice.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createStaffEnrollmentClient(api).finish({ token, password });
      setState('complete');
      setToken('');
      setPassword('');
      setRepeat('');
    } catch {
      setError(
        'We couldn’t finish setting up your account. Try again in a moment. If this keeps happening, your link may have expired: ask your administrator to invite you again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lv-staff-login">
      <EnrollmentBrand />
      <div className="lv-staff-login-panel">
        <section
          className="agn-staff-sign-in lv-enroll-card"
          aria-labelledby="enroll-title"
          aria-busy={state === 'checking'}
        >
          <p className="agn-staff-sign-in-eyebrow">Staff account setup</p>
          {state === 'checking' && (
            <>
              <h1 id="enroll-title">Checking your invitation…</h1>
              <p className="lv-enroll-wait">
                <span className="lv-staff-boot-spinner" aria-hidden="true" />
                This only takes a moment.
              </p>
            </>
          )}
          {state === 'invalid' && (
            <>
              <div className="lv-enroll-icon lv-enroll-icon--warn">
                <CircleAlert size={28} aria-hidden="true" />
              </div>
              <h1 id="enroll-title">This setup link can’t be used</h1>
              <p>
                It may have expired, already been used, or been replaced by a
                newer invitation. Setup links work once and last 24 hours.
              </p>
              <p className="agn-hint">
                Ask your administrator to send you a new invitation, then open
                the link in the newest email.
              </p>
            </>
          )}
          {state === 'ready' && setup && (
            <>
              <h1 id="enroll-title">Set up your account</h1>
              <p>Choose a password to finish setting up your staff account.</p>
              <div className="lv-enroll-identity">
                <span className="lv-enroll-avatar" aria-hidden="true">
                  {initials(setup.name)}
                </span>
                <span>
                  <strong>{setup.name}</strong>
                  <small>{setup.email}</small>
                </span>
              </div>
              {error && <StaffMessage>{error}</StaffMessage>}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void finish();
                }}
              >
                {/* Lets password managers save the login for this email. */}
                <input
                  type="email"
                  name="username"
                  autoComplete="username"
                  value={setup.email}
                  readOnly
                  hidden
                />
                <PasswordInput
                  label="Create password"
                  minLength={MIN_LENGTH}
                  maxLength={128}
                  required
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <PasswordInput
                  label="Confirm password"
                  required
                  value={repeat}
                  autoComplete="new-password"
                  onChange={(e) => setRepeat(e.target.value)}
                />
                <ul className="lv-enroll-checks" aria-label="Password checks">
                  <li data-met={longEnough}>
                    <Check size={16} aria-hidden="true" />
                    At least {MIN_LENGTH} characters
                    <span className="agn-sr-only">
                      {longEnough ? ' (done)' : ' (not yet)'}
                    </span>
                  </li>
                  <li data-met={matches}>
                    <Check size={16} aria-hidden="true" />
                    Both passwords match
                    <span className="agn-sr-only">
                      {matches ? ' (done)' : ' (not yet)'}
                    </span>
                  </li>
                </ul>
                <Button type="submit" busy={busy}>
                  Create my account
                </Button>
              </form>
              <p className="agn-hint">
                Never share your staff password. You can turn on authenticator
                sign-in later in your settings.
              </p>
            </>
          )}
          {state === 'complete' && (
            <>
              <div className="lv-enroll-icon lv-enroll-icon--done">
                <CircleCheck size={28} aria-hidden="true" />
              </div>
              <h1 id="enroll-title">Your account is ready</h1>
              <p>Sign in with your email and the password you just chose.</p>
              <a
                className="agn-button agn-button--primary lv-enroll-action"
                href="/"
              >
                Go to staff sign in
              </a>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
