'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, KeyRound } from 'lucide-react';
import type {
  SecurityStart,
  SecurityEmail,
  SecurityFinish,
  SecurityStatus,
  SecurityEmailResult,
  SecurityResult,
  TwoFactorProof,
} from '@auction-ng/shared/two-factor-schemas';
import { ProfileSection } from './profile';
import { BuyerStack } from './buyer';
import { Button } from './button';
import { PasswordInput } from './password-input';
import { OtpInput } from './otp-input';
import { Toast } from './toast';
import { Dialog } from './dialog';
import { TwoFactorInput } from './two-factor-input';

type Client = {
  status: () => Promise<SecurityStatus>;
  start: (value: SecurityStart) => Promise<{ id: string; expiresAt: string }>;
  email: (value: SecurityEmail) => Promise<SecurityEmailResult>;
  finish: (value: SecurityFinish) => Promise<SecurityResult | undefined>;
};
export function TwoFactorSettings({
  client,
  onChanged,
  makeQr,
}: {
  client: Client;
  onChanged?: (enabled: boolean) => void;
  makeQr?: (uri: string) => Promise<string>;
}) {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [purpose, setPurpose] = useState<SecurityStart['purpose'] | null>(null);
  const [step, setStep] = useState<'password' | 'email' | 'factor' | 'saved'>(
    'password',
  );
  const [password, setPassword] = useState(''),
    [email, setEmail] = useState(''),
    [id, setId] = useState('');
  const [setup, setSetup] = useState<SecurityEmailResult | null>(null),
    [qr, setQr] = useState('');
  const [newCode, setNewCode] = useState(''),
    [factor, setFactor] = useState<TwoFactorProof>({
      method: 'authenticator',
      code: '',
    });
  const [codes, setCodes] = useState<string[]>([]),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void client
      .status()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {
        if (active)
          setError(
            'Security settings could not be loaded. Reload this page and try again.',
          );
      });
    return () => {
      active = false;
    };
  }, [client]);
  const close = () => {
    if (busy || (codes.length > 0 && !saved)) return;
    setPurpose(null);
    setPassword('');
    setEmail('');
    setId('');
    setSetup(null);
    setQr('');
    setNewCode('');
    setFactor({ method: 'authenticator', code: '' });
    setCodes([]);
    setError('');
    setSaved(false);
    setStep('password');
  };
  const start = (value: SecurityStart['purpose']) => {
    setError('');
    setPurpose(value);
    setStep('password');
  };
  return (
    <ProfileSection
      title="Two-factor authentication"
      description="An extra check from your authenticator app protects your account and wallet."
      security
    >
      <BuyerStack>
        {error && !purpose && (
          <Toast emphasis tone="error" onClose={() => setError('')}>
            {error}
          </Toast>
        )}
        <div className="agn-mfa-status">
          <ShieldCheck size={24} aria-hidden="true" />
          <div>
            <strong>
              {status
                ? status.enabled
                  ? 'Authenticator protection is on'
                  : 'Add another layer of protection'
                : 'Loading security settings…'}
            </strong>
            <p>
              {status?.mandatory
                ? 'Required for every staff and administrator account.'
                : 'Use Google Authenticator or another compatible app.'}
            </p>
            {status?.enabled && (
              <p>{status.recoveryCodesRemaining} recovery codes remaining</p>
            )}
          </div>
        </div>
        <div className="agn-mfa-actions">
          {!status?.enabled ? (
            <Button disabled={!status} onClick={() => start('enable')}>
              Enable two-factor authentication
            </Button>
          ) : (
            <>
              <Button onClick={() => start('rotate')}>
                Change authenticator
              </Button>
              <Button variant="secondary" onClick={() => start('recovery')}>
                Replace recovery codes
              </Button>
              {!status.mandatory && (
                <Button variant="danger" onClick={() => start('disable')}>
                  Disable two-factor authentication
                </Button>
              )}
            </>
          )}
        </div>
      </BuyerStack>
      <Dialog
        open={purpose !== null}
        onClose={close}
        title={
          step === 'saved'
            ? 'Security settings updated'
            : purpose === 'disable'
              ? 'Disable authenticator protection'
              : 'Protect your account'
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !purpose) return;
            setBusy(true);
            setError('');
            void (async () => {
              if (step === 'password') {
                const result = await client.start({ purpose, password });
                setId(result.id);
                setPassword('');
                setStep('email');
              } else if (step === 'email') {
                const result = await client.email({ id, code: email });
                setEmail('');
                setSetup(result);
                setStep('factor');
                if (result.uri && makeQr) {
                  try {
                    setQr(await makeQr(result.uri));
                  } catch {
                    setQr('');
                  }
                }
              } else if (step === 'factor') {
                const result = await client.finish({
                  id,
                  ...(status?.enabled ? { factor } : {}),
                  ...(setup?.secret ? { newCode } : {}),
                });
                if (!result) throw Error('No confirmation');
                setCodes(result.recoveryCodes ?? []);
                setSetup(null);
                setQr('');
                setNewCode('');
                setFactor({ method: 'authenticator', code: '' });
                setStatus({
                  enabled: result.enabled,
                  mandatory: status?.mandatory ?? false,
                  recoveryCodesRemaining: result.recoveryCodes?.length ?? 0,
                });
                onChanged?.(result.enabled);
                setStep('saved');
              }
            })()
              .catch(() =>
                setError(
                  'This security check could not be completed. Check your password or codes and connection. Codes expire after five minutes; restart if needed.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <BuyerStack>
            {error && (
              <Toast emphasis tone="error" onClose={() => setError('')}>
                {error}
              </Toast>
            )}
            {step === 'password' && (
              <>
                <p>
                  Confirm your password. We will then send a security code to
                  your verified email.
                </p>
                <PasswordInput
                  label="Current password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  maxLength={128}
                  disabled={busy}
                  required
                />
              </>
            )}
            {step === 'email' && (
              <>
                <p>
                  Enter the six-digit security code sent to your email. This
                  request expires in five minutes.
                </p>
                <OtpInput
                  label="Email security code"
                  value={email}
                  onValueChange={setEmail}
                  disabled={busy}
                  required
                />
              </>
            )}
            {step === 'factor' && (
              <>
                {setup?.secret && (
                  <>
                    <p>
                      In your authenticator app, add a new account for LotVanta
                      {qr
                        ? ' by scanning this code or entering the setup key.'
                        : ' using this setup key.'}
                    </p>
                    {qr && (
                      <img
                        className="agn-mfa-qr"
                        src={qr}
                        alt="Scan with your authenticator app"
                        width={200}
                        height={200}
                      />
                    )}
                    <code className="agn-mfa-key">{setup.secret}</code>
                    <OtpInput
                      label="Code from the new authenticator"
                      value={newCode}
                      onValueChange={setNewCode}
                      disabled={busy}
                      required
                    />
                  </>
                )}
                {status?.enabled && (
                  <>
                    <p>
                      Confirm with your current authenticator or an unused
                      recovery code.
                    </p>
                    <TwoFactorInput
                      value={factor}
                      onChange={setFactor}
                      disabled={busy}
                    />
                  </>
                )}
              </>
            )}
            {step === 'saved' && (
              <>
                <Toast emphasis tone="success" onClose={close}>
                  {status?.enabled
                    ? 'Authenticator protection is enabled. Other devices have been signed out.'
                    : 'Authenticator protection has been disabled. Other devices have been signed out.'}
                </Toast>
                {codes.length > 0 && (
                  <>
                    <p>
                      <KeyRound size={20} aria-hidden="true" /> Save these
                      recovery codes somewhere private. Each works once, after
                      email verification. They will not be shown again. Previous
                      codes no longer work.
                    </p>
                    <div className="agn-mfa-codes">
                      {codes.map((code) => (
                        <code key={code}>{code}</code>
                      ))}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob(
                            [
                              'LotVanta recovery codes\nKeep private. Each code works once.\n\n' +
                                codes.join('\n'),
                            ],
                            { type: 'text/plain' },
                          ),
                        );
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'auction-ng-recovery-codes.txt';
                        link.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Download recovery codes
                    </Button>
                    <label className="agn-mfa-saved">
                      <input
                        type="checkbox"
                        checked={saved}
                        onChange={(event) => setSaved(event.target.checked)}
                      />
                      I have saved my recovery codes securely
                    </label>
                  </>
                )}
              </>
            )}
            {step !== 'saved' ? (
              <Button type="submit" busy={busy}>
                Continue securely
              </Button>
            ) : (
              <Button disabled={codes.length > 0 && !saved} onClick={close}>
                Done
              </Button>
            )}
            {step !== 'saved' && (
              <Button variant="ghost" disabled={busy} onClick={close}>
                Cancel
              </Button>
            )}
          </BuyerStack>
        </form>
      </Dialog>
    </ProfileSection>
  );
}
