'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createWithdrawalClient } from '@auction-ng/api-client/withdrawals';
import { createPaymentClient } from '@auction-ng/api-client/payments';
import { ApiError } from '@auction-ng/api-client/auth';
import { formatNaira } from '@auction-ng/shared/money';
import type { PaymentBankPage } from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { OtpInput } from '@auction-ng/ui/web/otp-input';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Toast } from '@auction-ng/ui/web/toast';
import { BuyerRow, BuyerStack, MoneyLine } from '@auction-ng/ui/web/buyer';
import {
  WalletHistoryPanel,
  WalletTable,
} from '@auction-ng/ui/web/wallet-workspace';
import { apiUrl, useBuyer } from '../lib/session';
import { useWalletRead } from '../lib/wallet-read';
type Client = ReturnType<typeof createWithdrawalClient>;
type Receipt = Awaited<ReturnType<Client['get']>>;
const labels: Record<Receipt['status'], string> = {
  draft: 'Email verification required',
  review: 'Under review',
  queued: 'Queued',
  processing: 'Processing',
  pending: 'Bank confirmation pending',
  success: 'Sent',
  failed: 'Failed',
  reversed: 'Reversed',
  rejected: 'Declined',
};
export function WalletWithdrawals() {
  const { tokens, deviceId, renewSession } = useBuyer();
  const [cursor, setCursor] = useState<string>();
  const read = useCallback(
    async (credentials: { accessToken: string; deviceId: string }) => {
      const client = createWithdrawalClient(apiUrl, credentials);
      const [overview, history] = await Promise.all([
        client.overview(),
        client.history({ limit: 10, cursor }),
      ]);
      return { overview, history };
    },
    [cursor],
  );
  const snapshot = useWalletRead(read);
  const [open, setOpen] = useState(false),
    [bankOpen, setBankOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [quote, setQuote] = useState<Awaited<ReturnType<Client['quote']>>>(),
    [receipt, setReceipt] = useState<Receipt>(),
    [amount, setAmount] = useState<number>(),
    [code, setCode] = useState(''),
    [password, setPassword] = useState('');
  const [banks, setBanks] = useState<PaymentBankPage>(),
    [bankCode, setBankCode] = useState(''),
    [accountNumber, setAccountNumber] = useState(''),
    [bvn, setBvn] = useState(''),
    [firstName, setFirstName] = useState(''),
    [lastName, setLastName] = useState(''),
    [consent, setConsent] = useState(false);
  const requestKey = useRef<string | undefined>(undefined),
    currentOwner = useRef(tokens?.user.id);
  currentOwner.current = tokens?.user.id;
  useEffect(() => {
    setOpen(false);
    setBankOpen(false);
    setReceipt(undefined);
    setQuote(undefined);
    setPassword('');
    setCode('');
    setBvn('');
    setAccountNumber('');
    setFirstName('');
    setLastName('');
    setBankCode('');
    setBanks(undefined);
    setConsent(false);
    setAmount(undefined);
    setMessage('');
    setBusy(false);
    setCursor(undefined);
    requestKey.current = undefined;
  }, [tokens?.user.id]);
  async function clientCall<T>(call: (client: Client) => Promise<T>) {
    if (!tokens) throw Error('Sign in again.');
    const owner = tokens.user.id;
    const run = async (accessToken: string) => {
      const result = await call(
        createWithdrawalClient(apiUrl, { accessToken, deviceId }),
      );
      if (currentOwner.current !== owner) throw Error('Account changed.');
      return result;
    };
    try {
      return await run(tokens.accessToken);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const fresh = await renewSession(tokens.accessToken);
      if (!fresh || fresh.user.id !== tokens.user.id) throw error;
      return run(fresh.accessToken);
    }
  }
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const owner = tokens?.user.id;
    try {
      await work();
    } catch (error) {
      if (currentOwner.current === owner)
        setMessage(
          error instanceof ApiError && error.status === 429
            ? 'Too many attempts. Please wait before trying again.'
            : error instanceof ApiError && error.status === 400
              ? 'Check your bank details or withdrawal code and try again.'
              : error instanceof ApiError && error.status === 401
                ? 'Check your password or sign in again.'
                : error instanceof ApiError && error.status === 409
                  ? 'Check your available funds, daily limit and verification details before retrying.'
                  : 'The request could not be confirmed. Check your connection and retry this same withdrawal.',
        );
    } finally {
      if (currentOwner.current === owner) setBusy(false);
    }
  }
  function received(value: Receipt) {
    if (currentOwner.current !== tokens?.user.id) return;
    setReceipt(value);
    setPassword('');
    snapshot.reload();
    window.dispatchEvent(new Event('auction-ng-wallet-change'));
  }
  useEffect(() => {
    if (
      !open ||
      !receipt ||
      ['draft', 'success', 'failed', 'reversed', 'rejected'].includes(
        receipt.status,
      ) ||
      !tokens
    )
      return;
    let active = true;
    const poll = async () => {
      if (document.hidden || !navigator.onLine) return;
      try {
        const value = await clientCall((client) => client.get(receipt.id));
        if (active && currentOwner.current === tokens.user.id) {
          setReceipt(value);
          snapshot.reload();
          window.dispatchEvent(new Event('auction-ng-wallet-change'));
        }
      } catch {
        /* Last confirmed result remains visible; funds stay protected. */
      }
    };
    const timer = window.setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [open, receipt?.id, receipt?.status, tokens?.user.id]);
  async function bankList(next = false) {
    if (!tokens) return;
    const page = await createPaymentClient(apiUrl, {
      accessToken: tokens.accessToken,
      deviceId,
    }).getBanks({
      limit: 50,
      ...(next && banks?.nextCursor ? { cursor: banks.nextCursor } : {}),
    });
    setBanks((old) =>
      next && old
        ? {
            items: [
              ...old.items,
              ...page.items.filter(
                (item) => !old.items.some((saved) => saved.code === item.code),
              ),
            ],
            nextCursor: page.nextCursor,
          }
        : page,
    );
  }
  const overview = snapshot.data?.overview,
    history = snapshot.data?.history;
  return (
    <WalletHistoryPanel label="Withdrawals">
      <BuyerRow>
        <div>
          <h2>Withdraw funds</h2>
          <p>Send available funds to your verified bank account.</p>
        </div>
        <Button
          onClick={() => {
            setMessage('');
            if (overview?.bank?.status === 'verified') {
              setOpen(true);
            } else {
              setBankOpen(true);
              void action(() => bankList());
            }
          }}
          disabled={!overview?.enabled || snapshot.error}
        >
          Withdraw to bank
        </Button>
      </BuyerRow>
      {snapshot.error && (
        <Toast tone="error" onClose={() => snapshot.reload()}>
          Withdrawal details could not be refreshed.{' '}
          <Button variant="ghost" onClick={snapshot.reload}>
            Retry
          </Button>
        </Toast>
      )}
      {overview && (
        <p>
          Eligible for automatic withdrawal:{' '}
          <strong>{formatNaira(overview.automaticAvailableKobo)}</strong>. Other
          available funds require review. Minimum{' '}
          {formatNaira(overview.minimumKobo)} · Daily limit{' '}
          {formatNaira(overview.dailyLimitKobo)}.
        </p>
      )}
      {overview && !overview.enabled && (
        <p>
          Withdrawals are not enabled yet. Contact support if you need help with
          your funds.
        </p>
      )}
      <WalletTable
        label="Withdrawal history"
        columns={['Date', 'Bank credit', 'Fees and levy', 'Status']}
      >
        {!history ? (
          <tr>
            <td colSpan={4}>Loading withdrawals...</td>
          </tr>
        ) : !history.items.length ? (
          <tr>
            <td colSpan={4}>No withdrawal requests yet.</td>
          </tr>
        ) : (
          history.items.map((item) => (
            <tr key={item.id}>
              <td>
                {new Date(item.createdAt).toLocaleDateString('en-NG', {
                  timeZone: 'Africa/Lagos',
                })}
              </td>
              <td>{formatNaira(item.amountKobo)}</td>
              <td>
                {formatNaira(
                  item.settledFeeKobo ?? item.feeKobo + item.levyKobo,
                )}
              </td>
              <td>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setReceipt(item);
                    setQuote(undefined);
                    setOpen(true);
                  }}
                >
                  {labels[item.status]}
                </Button>
              </td>
            </tr>
          ))
        )}
      </WalletTable>
      <BuyerRow>
        <Button
          variant="ghost"
          disabled={!cursor}
          onClick={() => setCursor(undefined)}
        >
          Newest withdrawals
        </Button>
        <Button
          variant="ghost"
          disabled={!history?.nextCursor}
          onClick={() => {
            if (history?.nextCursor) setCursor(history.nextCursor);
          }}
        >
          Older withdrawals
        </Button>
      </BuyerRow>
      <Dialog
        open={bankOpen}
        title="Verify your withdrawal bank"
        onClose={() => {
          if (!busy) {
            setBankOpen(false);
            setBvn('');
            setMessage('');
          }
        }}
      >
        <BuyerStack>
          {message && (
            <Toast tone="error" onClose={() => setMessage('')}>
              {message}
            </Toast>
          )}
          {overview?.bank ? (
            <>
              <p>
                {overview.bank.accountName} · {overview.bank.bankName} · Account
                ending {overview.bank.accountLast4}
              </p>
              <p>
                {overview.bank.status === 'pending'
                  ? 'Your BVN and bank verification is pending. This page updates automatically.'
                  : overview.bank.status === 'verified'
                    ? 'Your bank account is verified and ready for withdrawals.'
                    : 'Verification was not successful. Contact support before trying another account.'}
              </p>
              <Button variant="secondary" onClick={snapshot.reload}>
                Check verification
              </Button>
              {overview.bank.status === 'verified' && (
                <Button
                  onClick={() => {
                    setBankOpen(false);
                    setOpen(true);
                  }}
                >
                  Continue to withdrawal
                </Button>
              )}
              {overview.bank.status === 'pending' && (
                <Button
                  variant="ghost"
                  busy={busy}
                  onClick={() =>
                    void action(async () => {
                      await clientCall((client) => client.retryBank());
                      snapshot.reload();
                    })
                  }
                >
                  Retry verification request
                </Button>
              )}
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void action(async () => {
                  await clientCall((client) =>
                    client.verifyBank({
                      bankCode,
                      accountNumber,
                      bvn,
                      firstName,
                      lastName,
                      consent: true,
                    }),
                  );
                  setBvn('');
                  snapshot.reload();
                });
              }}
            >
              <BuyerStack>
                <Input
                  label="First name on your BVN"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
                <Input
                  label="Last name on your BVN"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
                <label className="agn-field">
                  Bank
                  <select
                    aria-label="Bank"
                    className="agn-input"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    required
                  >
                    <option value="">Choose your bank</option>
                    {banks?.items.map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </label>
                {banks?.nextCursor && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void action(() => bankList(true))}
                  >
                    Load more banks
                  </Button>
                )}
                <Input
                  label="Account number"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) =>
                    setAccountNumber(e.target.value.replace(/\D/g, ''))
                  }
                  required
                />
                <PasswordInput
                  label="BVN"
                  inputMode="numeric"
                  pattern="[0-9]{11}"
                  maxLength={11}
                  value={bvn}
                  onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
                  required
                  autoComplete="off"
                />
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    required
                  />{' '}
                  I agree to share these details with Paystack to verify my
                  identity and bank ownership.{' '}
                  <a href="/privacy-policy">Privacy policy</a>
                </label>
                <Button
                  type="submit"
                  busy={busy}
                  disabled={
                    !consent ||
                    !bankCode ||
                    bvn.length !== 11 ||
                    accountNumber.length !== 10
                  }
                >
                  Verify BVN and bank account
                </Button>
              </BuyerStack>
            </form>
          )}
        </BuyerStack>
      </Dialog>
      <Dialog
        open={open}
        title="Withdraw to your bank"
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setPassword('');
            setCode('');
            setMessage('');
          }
        }}
      >
        <BuyerStack>
          {message && (
            <Toast tone="error" onClose={() => setMessage('')}>
              {message}
            </Toast>
          )}
          {receipt && receipt.status !== 'draft' ? (
            <Toast
              tone={
                receipt.status === 'success'
                  ? 'success'
                  : ['failed', 'rejected', 'reversed'].includes(receipt.status)
                    ? 'error'
                    : 'info'
              }
              onClose={() => setOpen(false)}
            >
              {receipt.status === 'review'
                ? 'Your request is under review because it includes card-funded or unclassified money.'
                : receipt.status === 'success'
                  ? 'Your withdrawal was sent. Your bank may take longer to display the credit.'
                  : ['failed', 'reversed', 'rejected'].includes(receipt.status)
                    ? 'This withdrawal did not complete. Check your Wallet for returned funds and any retained provider charges.'
                    : 'Your withdrawal is processing or awaiting reconciliation. You do not need to submit another request. Contact support if it remains pending.'}
            </Toast>
          ) : receipt ? (
            <>
              <p>
                Enter the six-digit code sent to your verified email. It is
                valid for five minutes and confirms this withdrawal only.
              </p>
              <MoneyLine
                label="Total wallet deduction"
                value={formatNaira(receipt.totalKobo)}
                total
              />
              <OtpInput
                label="Withdrawal email code"
                value={code}
                onValueChange={setCode}
                disabled={busy}
              />
              <Button
                busy={busy}
                disabled={code.length !== 6}
                onClick={() =>
                  void action(async () => {
                    received(
                      await clientCall((client) =>
                        client.confirm({ id: receipt.id, code }),
                      ),
                    );
                    setCode('');
                  })
                }
              >
                Confirm withdrawal {formatNaira(receipt.amountKobo)}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setReceipt(undefined);
                  setQuote(undefined);
                  setCode('');
                  requestKey.current = undefined;
                }}
              >
                Start a new withdrawal
              </Button>
            </>
          ) : (
            <>
              <p>
                {overview?.bank?.accountName} · {overview?.bank?.bankName} ·
                Account ending {overview?.bank?.accountLast4}
              </p>
              <NairaInput
                label="Amount your bank receives"
                digitsOnly
                onAmountChange={(value) => {
                  setAmount(value);
                  setQuote(undefined);
                  requestKey.current = undefined;
                }}
                disabled={busy}
              />
              <Button
                variant="secondary"
                busy={busy}
                disabled={!amount || amount < (overview?.minimumKobo ?? 0)}
                onClick={() =>
                  void action(async () => {
                    if (amount)
                      setQuote(
                        await clientCall((client) => client.quote(amount)),
                      );
                  })
                }
              >
                Show withdrawal fees
              </Button>
              {quote && (
                <>
                  <MoneyLine
                    label="Your bank receives"
                    value={formatNaira(quote.amountKobo)}
                  />
                  <MoneyLine
                    label="Transfer fee"
                    value={formatNaira(quote.feeKobo)}
                  />
                  <MoneyLine
                    label="Applicable levy"
                    value={formatNaira(quote.levyKobo)}
                  />
                  <MoneyLine
                    label="Total wallet deduction"
                    value={formatNaira(quote.totalKobo)}
                    total
                  />
                  {overview &&
                    quote.totalKobo > overview.automaticAvailableKobo && (
                      <p>
                        This request includes funds that need review before
                        payment.
                      </p>
                    )}
                  <PasswordInput
                    label="Confirm your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={busy}
                  />
                  <Button
                    busy={busy}
                    disabled={!password}
                    onClick={() =>
                      void action(async () => {
                        if (!overview?.bank) return;
                        requestKey.current ??= crypto.randomUUID();
                        const value = await clientCall((client) =>
                          client.start({
                            bankId: overview.bank?.id ?? '',
                            amountKobo: quote.amountKobo,
                            acceptedTotalKobo: quote.totalKobo,
                            password,
                            idempotencyKey: requestKey.current ?? '',
                          }),
                        );
                        received(value);
                      })
                    }
                  >
                    Send withdrawal verification code
                  </Button>
                </>
              )}
            </>
          )}
          {receipt && receipt.status !== 'draft' && (
            <Button
              variant="secondary"
              onClick={() => {
                setReceipt(undefined);
                setQuote(undefined);
                requestKey.current = undefined;
                setOpen(false);
              }}
            >
              Back to wallet
            </Button>
          )}
          <p>
            Transfers normally process quickly, but bank arrival is not
            guaranteed to be instant.
          </p>
        </BuyerStack>
      </Dialog>
    </WalletHistoryPanel>
  );
}
