'use client';
import { useState } from 'react';
import { ShieldCheck } from '@auction-ng/ui/web/icons';
import { ApiError } from '@auction-ng/api-client/auth';
import { createPurchaseUnlockClient } from '@auction-ng/api-client/purchase-unlock';
import type { TwoFactorProof } from '@auction-ng/shared/two-factor-schemas';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { OtpInput } from '@auction-ng/ui/web/otp-input';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { TwoFactorInput } from '@auction-ng/ui/web/two-factor-input';
import { apiUrl, useBuyer } from '../lib/session';

type Step =
  { kind: 'password' } | { kind: 'code'; id: string; authenticator: boolean };

function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return 'Too many tries. Wait 15 minutes, then try again.';
    if (error.code === 'TWO_FACTOR_REQUIRED')
      return 'Enter the code from your authenticator app.';
    if (error.code === 'TWO_FACTOR_INVALID')
      return 'That authenticator code isn’t right. Wait for a new code and try again.';
    if (error.detail) return error.detail;
    if (error.status === 401) return 'Your session ended. Sign in again.';
  }
  return 'This couldn’t be checked. Check your connection and try again.';
}

/**
 * Loaded only when a bid or purchase needs it (see purchase-unlock-host).
 * "Confirm it's you" before bidding or buying: password, then the emailed
 * code and the authenticator when it is on. Confirmed for 30 minutes.
 */
export function PurchaseUnlockDialog({
  onDone,
}: {
  onDone: (confirmed: boolean) => void;
}) {
  const { tokens, deviceId } = useBuyer();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factor, setFactor] = useState<TwoFactorProof>({
    method: 'authenticator',
    code: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [field, setField] = useState('');
  if (!tokens) return null;
  const client = createPurchaseUnlockClient(apiUrl, {
    accessToken: tokens.accessToken,
    deviceId,
  });
  const finish = (confirmed: boolean) => {
    setOpen(false);
    setPassword('');
    onDone(confirmed);
  };
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setField('');
    try {
      await work();
    } catch (failure) {
      setError(message(failure));
      setField(failure instanceof ApiError ? (failure.field ?? '') : '');
    } finally {
      setBusy(false);
    }
  }
  const sendCode = () =>
    run(async () => {
      const asked = await client.start({ password });
      setCode('');
      setStep({
        kind: 'code',
        id: asked.id,
        authenticator: asked.authenticator,
      });
    });
  return (
    <Dialog open={open} onClose={() => finish(false)} title="Confirm it’s you">
      <form
        className="agn-unlock"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (step.kind === 'password') void sendCode();
          else
            void run(async () => {
              await client.finish({
                id: step.id,
                code,
                ...(step.authenticator ? { factor } : {}),
              });
              finish(true);
            });
        }}
      >
        <p className="agn-unlock-intro">
          <ShieldCheck size={20} aria-hidden="true" />
          To keep your wallet safe, confirm it’s you before you bid or buy. You
          won’t be asked again on this device for 30 minutes.
        </p>
        {step.kind === 'password' ? (
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            value={password}
            disabled={busy}
            error={field === 'password' ? error : undefined}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        ) : (
          <>
            <OtpInput
              label="Code from your email"
              hint="We sent a 6-digit code to your email. It works for 5 minutes."
              value={code}
              onValueChange={setCode}
              error={field === 'code' ? error : undefined}
              disabled={busy}
              required
            />
            {step.authenticator && (
              <TwoFactorInput
                value={factor}
                onChange={setFactor}
                disabled={busy}
              />
            )}
          </>
        )}
        {error && !['password', 'code'].includes(field) && (
          <p className="agn-unlock-error" role="alert">
            {error}
          </p>
        )}
        <div className="agn-unlock-actions">
          {step.kind === 'code' && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void sendCode()}
            >
              Send a new code
            </Button>
          )}
          <Button
            type="submit"
            busy={busy}
            disabled={
              step.kind === 'password'
                ? !password
                : code.length !== 6 ||
                  (step.authenticator && !factor.code.trim())
            }
          >
            {step.kind === 'password' ? 'Send code' : 'Confirm'}
          </Button>
        </div>
        <p className="agn-unlock-note">
          Nothing is reserved or charged until you confirm.
        </p>
      </form>
    </Dialog>
  );
}
