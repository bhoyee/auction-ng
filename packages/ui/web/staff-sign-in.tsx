'use client';
import { Input } from './input';
import { Button } from './button';
export function StaffSignIn({
  busy,
  error,
  disabled,
  onSignIn,
}: {
  busy: boolean;
  error: string;
  disabled: boolean;
  onSignIn: (email: string, password: string, code: string) => Promise<void>;
}) {
  return (
    <section className="agn-staff-sign-in">
      <h1>Staff sign in</h1>
      <p>
        Use your staff password and the six-digit code from Google
        Authenticator.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          await onSignIn(
            String(data.get('email') ?? ''),
            String(data.get('password') ?? ''),
            String(data.get('code') ?? ''),
          );
          form.reset();
        }}
      >
        <Input
          name="email"
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
        <Input
          name="code"
          label="Authenticator code"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          minLength={6}
          required
          disabled={busy || disabled}
          hint="Enter the current code. Each code can be used once."
        />
        {error && (
          <p className="agn-field-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" busy={busy} disabled={disabled}>
          Sign in to staff workspace
        </Button>
      </form>
      <p className="agn-hint">
        Staff accounts are set up by the operator. Buyer sign-in cannot access
        these controls.
      </p>
    </section>
  );
}
