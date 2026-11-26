'use client';
import { useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
  staffPasswordSchema,
  type StaffPasswordChange,
  type SecurityStart,
  type SecurityEmail,
  type SecurityStatus,
  type SecurityEmailResult,
  type TwoFactorProof,
} from '@auction-ng/shared';
import { Button } from './button';
import { Dialog } from './dialog';
import { BuyerStack } from './buyer';
import { PasswordInput } from './password-input';
import { OtpInput } from './otp-input';
import { TwoFactorInput } from './two-factor-input';
import { Toast } from './toast';

type Security = {
  status(): Promise<SecurityStatus>;
  start(value: SecurityStart): Promise<{ id: string; expiresAt: string }>;
  email(value: SecurityEmail): Promise<SecurityEmailResult>;
};
export function StaffPasswordChange({
  security,
  changePassword,
  online,
  onChanged,
  onRequireSignIn,
}: {
  security: Security;
  changePassword(value: StaffPasswordChange): Promise<void>;
  online: boolean;
  onChanged(): void;
  onRequireSignIn(): void;
}) {
  const [open, setOpen] = useState(false),
    [step, setStep] = useState<'password' | 'email' | 'factor'>('password');
  const [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState('');
  const [id, setId] = useState(''),
    [code, setCode] = useState(''),
    [enabled, setEnabled] = useState(false);
  const [factor, setFactor] = useState<TwoFactorProof>({
    method: 'authenticator',
    code: '',
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null),
    running = useRef(false);
  const minimum = staffPasswordSchema.minLength ?? 15;
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: 'nearest' });
      errorRef.current?.focus();
    }
  }, [error]);
  const close = () => {
    if (running.current) return;
    setOpen(false);
    setCurrent('');
    setPassword('');
    setConfirm('');
    setCode('');
    setId('');
    setStep('password');
    setError('');
    setUncertain(false);
    setFactor({ method: 'authenticator', code: '' });
  };
  async function submit() {
    if (running.current || !online || uncertain) return;
    setError('');
    if (step === 'password' && password !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    if (
      step === 'password' &&
      !staffPasswordSchema.safeParse(password).success
    ) {
      setError(`Use ${minimum}–128 characters for your new password.`);
      return;
    }
    running.current = true;
    setBusy(true);
    let saving = false;
    try {
      if (step === 'password') {
        const status = await security.status();
        const request = await security.start({
          purpose: 'change-password',
          password: current,
          newPassword: password,
        });
        setEnabled(status.enabled);
        setId(request.id);
        setCode('');
        setStep('email');
      } else {
        if (step === 'email') {
          await security.email({ id, code });
          setCode('');
          if (enabled) {
            setStep('factor');
            return;
          }
        }
        saving = true;
        await changePassword({
          currentPassword: current,
          newPassword: password,
          securityChallengeId: id,
          ...(step === 'factor' ? { factor } : {}),
        });
        setCurrent('');
        setPassword('');
        setConfirm('');
        setCode('');
        setFactor({ method: 'authenticator', code: '' });
        onChanged();
      }
    } catch (cause) {
      const status =
        cause && typeof cause === 'object' && 'status' in cause
          ? cause.status
          : undefined;
      if (status === 422 && saving) {
        setStep('factor');
        setEnabled(true);
        setError('Enter a valid authenticator or recovery code.');
      } else if (
        saving &&
        (status === undefined || (typeof status === 'number' && status >= 500))
      ) {
        setUncertain(true);
        setError(
          'The password change could not be confirmed. Sign in with the new password to check before trying again.',
        );
      } else
        setError(
          status === 429
            ? 'Too many attempts. Wait before trying again.'
            : step === 'password'
              ? 'Check your current password and connection. Sign in again if your session has expired.'
              : 'Verification failed. Check your code or close this form and start again if it has expired.',
        );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="agn-profile-actions">
        <Button disabled={!online} onClick={() => setOpen(true)}>
          <KeyRound size={18} aria-hidden="true" />
          Change password
        </Button>
      </div>
      <Dialog open={open} title="Change password" onClose={close}>
        <form
          aria-label="Change staff password"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <BuyerStack>
            <p>
              Verify your staff email before saving. Changing your password
              signs you out on all devices.
            </p>
            {error && (
              <div ref={errorRef} tabIndex={-1}>
                <Toast tone="error" emphasis onClose={() => setError('')}>
                  {error}
                </Toast>
              </div>
            )}
            {!online && (
              <p className="agn-field-error" role="alert">
                Reconnect before changing your password.
              </p>
            )}
            {step === 'password' ? (
              <>
                <PasswordInput
                  label="Current password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  disabled={busy}
                />
                <PasswordInput
                  label="New password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={minimum}
                  maxLength={128}
                  hint={`Use at least ${minimum} characters.`}
                  required
                  disabled={busy}
                />
                <PasswordInput
                  label="Confirm new password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  minLength={minimum}
                  maxLength={128}
                  required
                  disabled={busy}
                />
              </>
            ) : step === 'email' ? (
              <OtpInput
                label="Email verification code"
                hint="Enter the six-digit code sent to your staff email."
                value={code}
                onValueChange={setCode}
                required
                disabled={busy || uncertain}
              />
            ) : (
              <TwoFactorInput
                value={factor}
                onChange={setFactor}
                disabled={busy || uncertain}
              />
            )}
            {uncertain ? (
              <Button onClick={onRequireSignIn}>Return to sign in</Button>
            ) : (
              <Button type="submit" busy={busy} disabled={!online}>
                {step === 'password'
                  ? 'Send verification code'
                  : step === 'email' && enabled
                    ? 'Verify email'
                    : 'Change password'}
              </Button>
            )}
            <Button variant="danger" onClick={close} disabled={busy}>
              Cancel
            </Button>
          </BuyerStack>
        </form>
      </Dialog>
    </>
  );
}
