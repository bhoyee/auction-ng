import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@auction-ng/api-client/auth';
import { createPurchaseUnlockClient } from '@auction-ng/api-client/purchase-unlock';
import { Body, Button, Dialog, Input } from './controls';
import { n } from './native-styles';
import { styles as s } from './styles';
import { CodeInput, Password } from '../../screens/auth';
import { useSession } from '../../lib/session';
import { apiUrl } from '../../lib/config';
import { registerPurchaseUnlock } from '../../lib/purchase-unlock';

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
 * "Confirm it's you" before bidding or buying: password, then the emailed
 * code and the authenticator when it is on. Confirmed for 30 minutes.
 */
export function PurchaseUnlockSheet() {
  const { session, manager } = useSession();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factor, setFactor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const settle = useRef<((confirmed: boolean) => void) | undefined>(undefined);
  useEffect(() => {
    if (!session) return;
    registerPurchaseUnlock(
      () =>
        new Promise<boolean>((resolve) => {
          settle.current = resolve;
          setStep({ kind: 'password' });
          setPassword('');
          setCode('');
          setFactor('');
          setError('');
          setOpen(true);
        }),
    );
    return () => registerPurchaseUnlock(undefined);
  }, [session]);
  const finish = (confirmed: boolean) => {
    setOpen(false);
    setPassword('');
    settle.current?.(confirmed);
    settle.current = undefined;
  };
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  const sendCode = () =>
    run(async () => {
      const asked = await manager.run((c) =>
        createPurchaseUnlockClient(apiUrl, c).start({ password }),
      );
      setCode('');
      setStep({
        kind: 'code',
        id: asked.id,
        authenticator: asked.authenticator,
      });
    });
  const confirm = () =>
    run(async () => {
      if (step.kind !== 'code') return;
      await manager.run((c) =>
        createPurchaseUnlockClient(apiUrl, c).finish({
          id: step.id,
          code,
          ...(step.authenticator
            ? { factor: { method: 'authenticator', code: factor.trim() } }
            : {}),
        }),
      );
      finish(true);
    });
  return (
    <Dialog
      open={open}
      title="Confirm it’s you"
      presentation="sheet"
      expanded
      onClose={() => finish(false)}
      footer={
        step.kind === 'password' ? (
          <Button
            fullWidth
            busy={busy}
            disabled={!password}
            onPress={() => void sendCode()}
          >
            Send code
          </Button>
        ) : (
          <Button
            fullWidth
            busy={busy}
            disabled={
              code.length !== 6 || (step.authenticator && !factor.trim())
            }
            onPress={() => void confirm()}
          >
            Confirm
          </Button>
        )
      }
    >
      <Body tone="secondary">
        To keep your wallet safe, confirm it’s you before you bid or buy. You
        won’t be asked again on this device for 30 minutes.
      </Body>
      {step.kind === 'password' ? (
        <Password label="Password" value={password} onChange={setPassword} />
      ) : (
        <>
          <Body tone="secondary">
            Enter the 6-digit code we sent to your email. It works for 5
            minutes.
          </Body>
          <CodeInput value={code} onChange={setCode} />
          {step.authenticator && (
            <Input
              label="Authenticator code"
              style={n.verificationInput}
              value={factor}
              onChangeText={setFactor}
              keyboardType="number-pad"
              maxLength={6}
            />
          )}
          <Button
            variant="secondary"
            disabled={busy}
            onPress={() => void sendCode()}
          >
            Send a new code
          </Button>
        </>
      )}
      {!!error && (
        <Body tone="fine" style={s.errorText}>
          {error}
        </Body>
      )}
      <Body tone="fine">Nothing is reserved or charged until you confirm.</Body>
    </Dialog>
  );
}
