'use client';
import { useEffect, useRef, useState } from 'react';
import { createWithdrawalClient } from '@auction-ng/api-client/withdrawals';
import { ApiError } from '@auction-ng/api-client/auth';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { OtpInput } from '@auction-ng/ui/web/otp-input';
import { Toast } from '@auction-ng/ui/web/toast';
import { BuyerStack } from '@auction-ng/ui/web/buyer';
import { WithdrawalBankPicker } from './withdrawal-bank-picker';
import { apiUrl, useBuyer } from '../lib/session';
type Client = ReturnType<typeof createWithdrawalClient>;
type Change = Awaited<ReturnType<Client['getBankChange']>>;
export function WalletBankChange({
  open,
  onClose,
  initialId,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  initialId?: string;
  onUpdated: () => void;
}) {
  const { tokens, deviceId, renewSession } = useBuyer();
  const [change, setChange] = useState<Change>();
  const [bankCode, setBankCode] = useState(''),
    [accountNumber, setAccountNumber] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState('');
  const key = useRef<string | undefined>(undefined),
    owner = useRef(tokens?.user.id);
  owner.current = tokens?.user.id;
  async function call<T>(run: (client: Client) => Promise<T>) {
    if (!tokens) throw new ApiError(401);
    const userId = tokens.user.id;
    const execute = async (accessToken: string) => {
      const result = await run(
        createWithdrawalClient(apiUrl, { accessToken, deviceId }),
      );
      if (owner.current !== userId) throw new ApiError(401);
      return result;
    };
    try {
      return await execute(tokens.accessToken);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const renewed = await renewSession(tokens.accessToken);
      if (!renewed || renewed.user.id !== userId) throw error;
      return execute(renewed.accessToken);
    }
  }
  async function action(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await run();
    } catch (error) {
      if (
        error instanceof ApiError &&
        [400, 401, 403, 409, 429].includes(error.status) &&
        !change
      )
        key.current = undefined;
      setMessage(
        error instanceof ApiError && error.status === 401
          ? 'Check your password or sign in again.'
          : error instanceof ApiError && error.status === 409
            ? 'An outstanding withdrawal or bank change prevents this request. Finish it or contact support before retrying.'
            : error instanceof ApiError && error.status === 400
              ? 'Check your bank details or six-digit code and try again.'
              : error instanceof ApiError && error.status === 429
                ? 'Too many attempts. Please wait before trying again.'
                : 'Your bank change could not be confirmed. Check your connection and retry this same request.',
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!open || !initialId) return;
    let active = true;
    setLoading(true);
    void call((client) => client.getBankChange(initialId))
      .then((value) => {
        if (active) setChange(value);
      })
      .catch(() => {
        if (active)
          setMessage(
            'Your bank change could not be loaded. Close this window and retry.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, initialId, tokens?.user.id]);
  useEffect(() => {
    if (change?.id) onUpdated();
  }, [change?.id, change?.status, onUpdated]);
  useEffect(() => {
    if (!open || change?.status !== 'verifying') return;
    let active = true,
      running = false;
    const refresh = async () => {
      if (running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const result = await call((client) => client.getBankChange(change.id));
        if (active) setChange(result);
      } catch {
        /* Retain confirmed verification state while offline. */
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void refresh(), 30000);
    const resume = () => void refresh();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
    };
  }, [open, change?.id, change?.status, tokens?.user.id]);
  function close() {
    if (busy) return;
    setPassword('');
    setCode('');
    setMessage('');
    if (change && ['complete', 'rejected', 'expired'].includes(change.status)) {
      setChange(undefined);
      key.current = undefined;
      setAccountNumber('');
      setBankCode('');
      setConsent(false);
    }
    onClose();
  }
  return (
    <Dialog open={open} title="Change withdrawal account" onClose={close}>
      <BuyerStack>
        {message && (
          <Toast tone="error" emphasis onClose={() => setMessage('')}>
            {message}
          </Toast>
        )}
        {loading ? (
          <p role="status">Loading your bank change…</p>
        ) : change ? (
          <>
            <p>
              <strong>{change.accountName}</strong> · {change.bankName} ·
              Account ending <strong>{change.accountLast4}</strong>
            </p>
            {change.status === 'draft' ? (
              <>
                <p>
                  Enter the six-digit code sent to your verified email. It
                  confirms this account change only and expires after five
                  minutes.
                </p>
                <OtpInput
                  label="Bank change email code"
                  value={code}
                  onValueChange={setCode}
                  disabled={busy}
                />
                <Button
                  busy={busy}
                  disabled={code.length !== 6}
                  onClick={() =>
                    void action(async () => {
                      setChange(
                        await call((client) =>
                          client.confirmBankChange({ id: change.id, code }),
                        ),
                      );
                      setCode('');
                    })
                  }
                >
                  Confirm account change
                </Button>
                {!change.emailSent && (
                  <Button
                    variant="primary"
                    busy={busy}
                    onClick={() =>
                      void action(async () =>
                        setChange(
                          await call((client) =>
                            client.retryBankChange(change.id),
                          ),
                        ),
                      )
                    }
                  >
                    Retry code delivery
                  </Button>
                )}
              </>
            ) : (
              <Toast
                emphasis
                tone={
                  change.status === 'complete'
                    ? 'success'
                    : ['rejected', 'expired'].includes(change.status)
                      ? 'error'
                      : 'info'
                }
                onClose={close}
              >
                {change.status === 'complete'
                  ? 'Your withdrawal account has been changed. Future withdrawals will use this verified account.'
                  : change.status === 'verifying'
                    ? 'Your new account is being checked against your existing verified BVN. Your current account stays selected until verification succeeds. New withdrawals are paused during this check.'
                    : change.status === 'expired'
                      ? 'This bank-change code expired. Start again to receive a new code.'
                      : 'Bank verification was not completed. Your previous account is still selected. Contact support if you need help.'}
              </Toast>
            )}
            {change.status === 'verifying' && (
              <Button
                busy={busy}
                onClick={() =>
                  void action(async () =>
                    setChange(
                      await call((client) => client.retryBankChange(change.id)),
                    ),
                  )
                }
              >
                Retry bank verification
              </Button>
            )}
            {['expired', 'rejected'].includes(change.status) && (
              <Button
                onClick={() => {
                  setChange(undefined);
                  key.current = undefined;
                  setCode('');
                  setPassword('');
                }}
              >
                Start a new bank change
              </Button>
            )}
            <Button onClick={close} disabled={busy}>
              Back to wallet
            </Button>
          </>
        ) : (
          <>
            <p>
              Choose another bank account in your own name. We will verify it
              against your existing BVN after password and email-code
              confirmation.
            </p>
            <p>
              Finish any outstanding withdrawal first. Your current account
              stays selected until the new one is verified.
            </p>
            {open && (
              <WithdrawalBankPicker
                value={bankCode}
                onChange={setBankCode}
                disabled={busy || !!key.current}
              />
            )}
            <Input
              label="New account number"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              autoComplete="off"
              value={accountNumber}
              onChange={(e) =>
                setAccountNumber(e.target.value.replace(/\D/g, ''))
              }
              disabled={busy || !!key.current}
            />
            <PasswordInput
              label="Confirm your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
            <label className="agn-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={busy || !!key.current}
              />
              <span>
                I agree to Paystack verifying this account against my existing
                BVN.
              </span>
            </label>
            <Button
              busy={busy}
              disabled={
                !bankCode ||
                accountNumber.length !== 10 ||
                !password ||
                !consent
              }
              onClick={() =>
                void action(async () => {
                  key.current ??= crypto.randomUUID();
                  setChange(
                    await call((client) =>
                      client.startBankChange({
                        bankCode,
                        accountNumber,
                        password,
                        consent: true,
                        idempotencyKey: key.current ?? '',
                      }),
                    ),
                  );
                  setPassword('');
                })
              }
            >
              Send account-change code
            </Button>
          </>
        )}
      </BuyerStack>
    </Dialog>
  );
}
