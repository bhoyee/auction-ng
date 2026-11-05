'use client';
import { useEffect, useState } from 'react';
import { createStaffEnrollmentClient } from '@auction-ng/api-client/staff-admin';
import { BrandLogo } from '@auction-ng/ui/web/brand-logo';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { OtpInput } from '@auction-ng/ui/web/otp-input';
import { Button } from '@auction-ng/ui/web/button';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export function StaffEnrollment() {
  const [token, setToken] = useState(''),
    [setup, setSetup] = useState<{
      name: string;
      email: string;
      secret: string;
    }>(),
    [password, setPassword] = useState(''),
    [repeat, setRepeat] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [complete, setComplete] = useState(false);
  useEffect(() => {
    const value = window.location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{43}$/.test(value)) setToken(value);
    else setError('Open the private setup link your administrator sent you.');
    window.history.replaceState(null, '', '/enroll');
  }, []);
  async function begin() {
    setBusy(true);
    setError('');
    try {
      const value = await createStaffEnrollmentClient(api).start(token);
      setSetup(value);
    } catch {
      setError(
        'This invitation is unavailable or expired. Ask your administrator for another link.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    if (password !== repeat) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createStaffEnrollmentClient(api).finish({ token, password, code });
      setComplete(true);
      setSetup(undefined);
      setToken('');
      setPassword('');
      setRepeat('');
      setCode('');
    } catch {
      setError(
        'Setup could not be confirmed. Check your current authenticator code and retry. An expired invitation must be replaced by your administrator.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="lv-staff-login">
      <BrandLogo />
      <section className="lv-staff-panel lv-staff-form">
        <h1>Secure your staff account</h1>
        {error && <StaffMessage>{error}</StaffMessage>}
        {complete ? (
          <>
            <StaffMessage tone="success">
              Your account is ready. Sign in with your password and a fresh
              authenticator code.
            </StaffMessage>
            <a className="agn-button agn-button--primary" href="/">
              Go to staff sign in
            </a>
          </>
        ) : !setup ? (
          <>
            <p>
              Choose your private password and connect Google Authenticator.
              Two-factor authentication is required for every staff account.
            </p>
            <Button busy={busy} disabled={!token} onClick={() => void begin()}>
              Begin secure setup
            </Button>
          </>
        ) : (
          <form
            className="lv-staff-form"
            onSubmit={(e) => {
              e.preventDefault();
              void finish();
            }}
          >
            <p>
              <strong>{setup.name}</strong>
              <br />
              {setup.email}
            </p>
            <PasswordInput
              label="Create password"
              minLength={15}
              maxLength={128}
              required
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              hint="Use at least 15 characters. Never share your staff password."
            />
            <PasswordInput
              label="Confirm password"
              required
              value={repeat}
              autoComplete="new-password"
              onChange={(e) => setRepeat(e.target.value)}
            />
            <fieldset>
              <legend>Connect Google Authenticator</legend>
              <p>
                In the authenticator app, choose “Enter a setup key”. Use your
                staff email as the account name, select Time based, and enter
                this private key.
              </p>
              <code className="lv-staff-invite-link">{setup.secret}</code>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(setup.secret)
                    .catch(() => setError('Copy the setup key manually.'))
                }
              >
                Copy private setup key
              </Button>
            </fieldset>
            <OtpInput
              label="Authenticator code"
              required
              value={code}
              onValueChange={setCode}
            />
            <Button type="submit" busy={busy}>
              Complete staff setup
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
