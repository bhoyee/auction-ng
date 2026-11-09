'use client';
import { Input } from './input';
import { Button } from './button';

const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  // Fixed-length mask so the hint does not reveal the address length.
  return `${name.slice(0, 1)}***@${domain}`;
};

export function StaffSignIn({
  busy,
  error,
  disabled,
  onSignIn,
  challenge,
  onVerify,
  onResend,
  onBack,
  onIdentityChange,
}: {
  busy: boolean;
  error: string;
  disabled: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  // Present after a correct password: the email code (and authenticator) step.
  challenge?: { email: string; twoFactorRequired: boolean; resent: boolean };
  onVerify: (code: string, authenticatorCode: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
  onIdentityChange?: () => void;
}) {
  if (challenge)
    return (
      <section key="code" className="agn-staff-sign-in">
        <h1>Check your email</h1>
        <p>
          {challenge.resent ? 'We sent a new code. ' : ''}Enter the six-digit
          code sent to <strong>{maskEmail(challenge.email)}</strong>. It’s valid
          for five minutes.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await onVerify(
              String(data.get('code') ?? ''),
              String(data.get('authenticatorCode') ?? ''),
            );
          }}
        >
          <Input
            name="code"
            label="Email code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            required
            autoFocus
            disabled={busy || disabled}
          />
          {challenge.twoFactorRequired && (
            <Input
              name="authenticatorCode"
              label="Authenticator code"
              autoComplete="off"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              minLength={6}
              required
              disabled={busy || disabled}
              hint="Open your authenticator app and enter the current code. Each code can be used once."
            />
          )}
          {error && (
            <p className="agn-field-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" busy={busy} disabled={disabled}>
            Verify and sign in
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || disabled}
            onClick={() => void onResend()}
          >
            Send a new code
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onBack}
          >
            Use a different account
          </Button>
        </form>
      </section>
    );
  return (
    <section key="password" className="agn-staff-sign-in">
      <h1>Staff sign in</h1>
      <p>
        Sign in with your staff email and password. We’ll email you a code to
        confirm it’s you.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          await onSignIn(
            String(data.get('email') ?? ''),
            String(data.get('password') ?? ''),
          );
        }}
      >
        <Input
          name="email"
          onChange={onIdentityChange}
          label="Staff email"
          type="email"
          autoComplete="username"
          required
          disabled={busy || disabled}
        />
        <Input
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
          disabled={busy || disabled}
        />
        {error && (
          <p className="agn-field-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" busy={busy} disabled={disabled}>
          Continue
        </Button>
      </form>
      <p className="agn-hint">
        Staff accounts are set up by the operator. Buyer sign-in cannot access
        these controls.
      </p>
    </section>
  );
}
