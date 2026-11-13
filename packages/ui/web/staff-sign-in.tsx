'use client';
import { Input } from './input';
import { Button } from './button';
import { PasswordInput } from './password-input';
export function StaffSignIn({
  busy,
  error,
  disabled,
  onSignIn,
  requiresCode = false,
  onIdentityChange,
}: {
  busy: boolean;
  error: string;
  disabled: boolean;
  onSignIn: (email: string, password: string, code: string) => Promise<void>;
  requiresCode?: boolean;
  onIdentityChange?: () => void;
}) {
  return (
    <section
      className="agn-staff-sign-in"
      aria-labelledby="staff-sign-in-title"
    >
      <p className="agn-staff-sign-in-eyebrow">LotVanta staff portal</p>
      <h1 id="staff-sign-in-title">Staff sign in</h1>
      <p>Use the staff email and password your admin set up for you.</p>
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
        }}
      >
        <Input
          name="email"
          onChange={onIdentityChange}
          label="Staff email"
          type="email"
          autoComplete="username"
          placeholder="you@lotvanta.ng"
          required
          disabled={busy || disabled}
        />
        <PasswordInput
          name="password"
          label="Password"
          autoComplete="current-password"
          maxLength={128}
          required
          disabled={busy || disabled}
        />
        {requiresCode && (
          <Input
            name="code"
            label="Authenticator code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            required
            autoFocus
            disabled={busy || disabled}
            hint="Enter the 6-digit code from your authenticator app. Each code works once."
          />
        )}
        {error && (
          <p className="agn-field-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="large" busy={busy} disabled={disabled}>
          Sign in
        </Button>
      </form>
      <p className="agn-hint">
        No staff account? Ask your admin to invite you. Buyer accounts can’t
        sign in here.
      </p>
    </section>
  );
}
