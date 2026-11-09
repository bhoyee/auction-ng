import { useEffect, useState } from 'react';
import { createActionVerificationClient } from '@auction-ng/api-client/action-verification';
import { ApiError } from '@auction-ng/api-client/auth';
import type {
  ActionPurpose,
  ActionVerifyChallenge,
  ActionVerifyResult,
} from '@auction-ng/shared/action-verification';
import { Body, Button, Input, Dialog } from './ui/controls';
import { Notice } from './ui/page';
import { n } from './ui/native-styles';
import { Password, CodeInput } from '../screens/auth';
import { useSession } from '../lib/session';
import { apiUrl } from '../lib/config';

const copy: Record<ActionPurpose, { title: string; intro: string }> = {
  bidding: {
    title: 'Confirm it’s you to bid',
    intro:
      'Enter your password and the code we email you. You can then bid for 30 minutes without being asked again.',
  },
  'buy-now': {
    title: 'Confirm it’s you to buy',
    intro:
      'Enter your password and the code we email you before this purchase.',
  },
  'bid-cancellation': {
    title: 'Confirm it’s you',
    intro:
      'Enter your password and the code we email you before sending this cancellation request.',
  },
};

function message(error: unknown, online: boolean) {
  if (!online) return 'You’re offline. Reconnect, then try again.';
  if (!(error instanceof ApiError))
    return 'We couldn’t reach LotVanta. Check your connection and try again.';
  if (error.code === 'TWO_FACTOR_REQUIRED')
    return 'Enter your authenticator code.';
  if (error.code === 'TWO_FACTOR_INVALID')
    return 'Check your authenticator code and try again.';
  if (error.status === 401) return 'Check your password and try again.';
  if (error.status === 400) return 'Check the six-digit email code.';
  if (error.status === 429)
    return 'Too many attempts. Wait a few minutes, then try again.';
  if (error.status === 503)
    return 'We can’t send email codes right now. Try again shortly.';
  return 'Something went wrong. Try again.';
}

export function ActionVerificationSheet({
  open,
  purpose,
  lotId,
  onVerified,
  onClose,
}: {
  open: boolean;
  purpose: ActionPurpose;
  lotId?: string;
  onVerified: (result: ActionVerifyResult) => void;
  onClose: () => void;
}) {
  const { manager, online } = useSession();
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<ActionVerifyChallenge>();
  const [code, setCode] = useState('');
  const [factor, setFactor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) return;
    setPassword('');
    setChallenge(undefined);
    setCode('');
    setFactor('');
    setError('');
  }, [open]);

  async function send() {
    if (busy || !password) return;
    setBusy(true);
    setError('');
    try {
      setChallenge(
        await manager.run((c) =>
          createActionVerificationClient(apiUrl, c).start({
            purpose,
            password,
            ...(lotId ? { lotId } : {}),
          }),
        ),
      );
      setCode('');
    } catch (failure) {
      setError(message(failure, online));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (busy || !challenge || code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      const result = await manager.run((c) =>
        createActionVerificationClient(apiUrl, c).finish({
          id: challenge.id,
          code,
          ...(challenge.twoFactorRequired
            ? { factor: { method: 'authenticator' as const, code: factor } }
            : {}),
        }),
      );
      setPassword('');
      onVerified(result);
    } catch (failure) {
      setError(message(failure, online));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={copy[purpose].title}
      presentation="sheet"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Notice message={error} onClose={() => setError('')} />
      {!challenge ? (
        <>
          <Body tone="secondary">{copy[purpose].intro}</Body>
          <Password
            label="Your password"
            value={password}
            onChange={setPassword}
          />
          <Button
            busy={busy}
            disabled={!password || !online}
            onPress={() => void send()}
          >
            Email me a code
          </Button>
        </>
      ) : (
        <>
          <Body tone="secondary">
            Enter the six-digit code sent to your email. It’s valid for five
            minutes.
          </Body>
          <CodeInput value={code} onChange={setCode} />
          {challenge.twoFactorRequired && (
            <Input
              label="Authenticator code"
              style={n.verificationInput}
              value={factor}
              onChangeText={(text) =>
                setFactor(text.replace(/\D/g, '').slice(0, 6))
              }
              keyboardType="number-pad"
            />
          )}
          <Button
            busy={busy}
            disabled={
              code.length !== 6 ||
              (challenge.twoFactorRequired && factor.length !== 6) ||
              !online
            }
            onPress={() => void confirm()}
          >
            Confirm and continue
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !online}
            onPress={() => void send()}
          >
            Send a new code
          </Button>
        </>
      )}
    </Dialog>
  );
}
