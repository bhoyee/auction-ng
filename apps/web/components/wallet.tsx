'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPaymentClient } from '@auction-ng/api-client/payments';
import { createWalletClient } from '@auction-ng/api-client/wallet';
import {
  type VirtualAccountInput,
  type WalletHistory,
} from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import { Badge } from '@auction-ng/ui/web/auction';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Consent } from '@auction-ng/ui/web/consent';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import {
  BuyerPanel,
  BuyerRow,
  BuyerStack,
  BuyerSkeleton,
  MoneyLine,
} from '@auction-ng/ui/web/buyer';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { Input } from '@auction-ng/ui/web/input';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Select } from '@auction-ng/ui/web/select';
import { PortalWalletSummary } from '@auction-ng/ui/web/buyer-portal';
import { apiUrl, useBuyer } from '../lib/session';
import { BankPicker } from './bank-picker';
import { usePrivateRead } from '../lib/private-read';

const walletActivityLabels: Record<
  WalletHistory['items'][number]['operation'],
  string
> = {
  topup: 'Funds added',
  debit: 'Payment',
  payout: 'Withdrawal',
  hold: 'Bid reservation',
  capture: 'Winning bid payment',
  release: 'Reservation released',
  refund: 'Refund',
};

export function Wallet() {
  const session = useBuyer();
  const [bankSetup, setBankSetup] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [ledgerCursor, setLedgerCursor] = useState<string>();
  const read = useCallback(
    async (credentials: { accessToken: string; deviceId: string }) => {
      const wallet = createWalletClient(apiUrl, credentials);
      const payments = createPaymentClient(apiUrl, credentials);
      const balance = await wallet.openWallet();
      const [history, account, ledgerHistory] = await Promise.all([
        payments.getHistory({ limit: 20, cursor }),
        payments.getAccount(),
        wallet.getHistory({ limit: 20, cursor: ledgerCursor }),
      ]);
      return { balance, history, account, ledgerHistory };
    },
    [cursor, ledgerCursor],
  );
  const { data, error, reload } = usePrivateRead(read);
  useEffect(() => {
    window.addEventListener('auction-ng-wallet-change', reload);
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener('auction-ng-wallet-change', reload);
      window.removeEventListener('focus', reload);
    };
  }, [reload]);
  const [amount, setAmount] = useState<number>();
  const [method, setMethod] = useState<'transfer' | 'local' | 'international'>(
    'transfer',
  );
  const [quote, setQuote] = useState<{
    charge: number;
    fee: number;
    credit: number;
    policy: string;
  }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const checkout = useRef<{
    idempotencyKey: string;
    amount: number;
    method: 'local' | 'international';
    fee: number;
    credit: number;
    policy: 'paystack-card-local-v1' | 'paystack-card-international-v1';
  } | null>(null);
  const credentials = session.tokens
    ? { accessToken: session.tokens.accessToken, deviceId: session.deviceId }
    : null;
  const getQuote = async () => {
    if (!credentials || !amount || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const payments = createPaymentClient(apiUrl, credentials);
      if (method === 'transfer') {
        const value = await payments.quote(amount);
        setQuote({
          charge: value.transferKobo,
          fee: value.feeKobo,
          credit: value.creditKobo,
          policy: value.feePolicy,
        });
      } else {
        const value = await payments.quoteCard(amount, method);
        setQuote({
          charge: value.amountKobo,
          fee: value.feeKobo,
          credit: value.creditKobo,
          policy: value.feePolicy,
        });
      }
    } catch {
      setMessage(
        'Funding is unavailable or this amount is too small. Check the amount and try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  const pay = async () => {
    if (!credentials || !quote || method === 'transfer' || busy) return;
    setBusy(true);
    try {
      checkout.current ??= {
        idempotencyKey: crypto.randomUUID(),
        amount: quote.charge,
        method,
        fee: quote.fee,
        credit: quote.credit,
        policy:
          method === 'local'
            ? 'paystack-card-local-v1'
            : 'paystack-card-international-v1',
      };
      const value = checkout.current;
      const result = await createPaymentClient(
        apiUrl,
        credentials,
      ).initializeCard({
        amountKobo: value.amount,
        cardType: value.method,
        feePolicy: value.policy,
        acceptedFeeKobo: value.fee,
        acceptedCreditKobo: value.credit,
        consent: true,
        idempotencyKey: value.idempotencyKey,
      });
      const target = new URL(result.authorizationUrl);
      if (
        target.protocol !== 'https:' ||
        target.hostname !== 'checkout.paystack.com' ||
        target.username ||
        target.password
      )
        throw new Error('Unsafe checkout address');
      sessionStorage.setItem('auction-ng-pending-payment', result.paymentId);
      window.location.assign(target.href);
    } catch {
      setMessage(
        'Checkout could not be opened. Retry this payment to keep the same payment reference.',
      );
    } finally {
      setBusy(false);
    }
  };
  const confirmPayment = async () => {
    if (!credentials || busy) return;
    setBusy(true);
    try {
      const id = sessionStorage.getItem('auction-ng-pending-payment');
      if (!id) {
        setMessage(
          'No card checkout is pending in this browser. Check your funding history below.',
        );
        return;
      }
      const result = await createPaymentClient(apiUrl, credentials).confirmCard(
        id,
      );
      window.dispatchEvent(new Event('auction-ng-wallet-change'));
      setMessage(
        result.status === 'credited'
          ? 'Payment confirmed. Your wallet has been credited.'
          : result.status === 'failed'
            ? 'This payment failed. Your wallet has not been credited.'
            : 'Payment is still pending. Check again shortly.',
      );
      if (result.status !== 'pending') {
        sessionStorage.removeItem('auction-ng-pending-payment');
        checkout.current = null;
      }
      reload();
    } catch {
      setMessage(
        'Payment could not be checked. Try again; funds are only credited after verification.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <BuyerPage
      layout="wallet"
      title="Balance"
      action={<Badge>Test payments</Badge>}
      description="Your available funds cover your bids and their auction fees. Paystack funding fees are paid by you."
    >
      <BuyerStack>
        {error ? (
          <ErrorState onRetry={reload} />
        ) : !data ? (
          <BuyerSkeleton />
        ) : (
          <>
            <PortalWalletSummary
              available={data.balance.availableKobo}
              held={data.balance.heldKobo}
              total={data.balance.totalKobo}
            />
            <BuyerPanel>
              <h2>Bank transfer</h2>
              {'accountNumber' in data.account ? (
                <BuyerStack>
                  <p>{data.account.bankName}</p>
                  <PriceAccount account={data.account.accountNumber} />
                  <p>
                    Transfer to this account. Your wallet is credited after
                    Paystack verifies the payment, less the disclosed processing
                    fee.
                  </p>
                </BuyerStack>
              ) : data.account.status === 'pending' ? (
                <p>Your bank account is being prepared. Check again shortly.</p>
              ) : (
                <Button variant="secondary" onClick={() => setBankSetup(true)}>
                  Set up personal transfer account
                </Button>
              )}
            </BuyerPanel>
          </>
        )}
        <BuyerPanel>
          <h2>Add funds</h2>
          <BuyerStack>
            <NairaInput
              label="Amount to pay"
              digitsOnly
              onAmountChange={(value) => {
                if (!checkout.current) {
                  setAmount(value);
                  setQuote(undefined);
                }
              }}
              disabled={busy || checkout.current !== null}
            />
            <Select
              label="Payment method"
              value={method}
              disabled={busy || checkout.current !== null}
              onChange={(event) => {
                setMethod(
                  event.target.value === 'local'
                    ? 'local'
                    : event.target.value === 'international'
                      ? 'international'
                      : 'transfer',
                );
                setQuote(undefined);
              }}
            >
              <option value="transfer">Bank transfer</option>
              <option value="local">Nigerian card</option>
              <option value="international">International card</option>
            </Select>
            <Button
              variant="secondary"
              busy={busy}
              disabled={!amount || checkout.current !== null}
              onClick={() => void getQuote()}
            >
              Show fee and wallet credit
            </Button>
            {quote && (
              <>
                <MoneyLine label="You pay" value={formatNaira(quote.charge)} />
                <MoneyLine
                  label="Paystack processing fee"
                  value={formatNaira(quote.fee)}
                />
                <MoneyLine
                  label="Your wallet receives"
                  value={formatNaira(quote.credit)}
                  total
                />
                {method !== 'transfer' && (
                  <Button busy={busy} onClick={() => void pay()}>
                    Accept fee and pay {formatNaira(quote.charge)} by card
                  </Button>
                )}
              </>
            )}
            <Button
              variant="secondary"
              busy={busy}
              onClick={() => void confirmPayment()}
            >
              Check pending card payment
            </Button>
            {message && <p role="status">{message}</p>}
          </BuyerStack>
        </BuyerPanel>
        <BuyerPanel>
          <h2>Funding history</h2>
          {data &&
            (data.history.items.length ? (
              <BuyerStack>
                {data.history.items.map((item) => (
                  <div key={item.id}>
                    <Badge>{item.status}</Badge>
                    <MoneyLine
                      label={`${item.fundingMethod === 'card' ? 'Card' : 'Bank transfer'} · ${new Date(item.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT`}
                      value={formatNaira(item.creditKobo)}
                    />
                    <p>
                      Paid {formatNaira(item.transferKobo)} · Fee{' '}
                      {formatNaira(item.feeKobo)}
                    </p>
                  </div>
                ))}
                <BuyerRow>
                  {cursor && (
                    <Button
                      variant="secondary"
                      onClick={() => setCursor(undefined)}
                    >
                      Back to newest
                    </Button>
                  )}
                  {data.history.nextCursor && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setCursor(data.history.nextCursor ?? undefined)
                      }
                    >
                      Next page
                    </Button>
                  )}
                </BuyerRow>
              </BuyerStack>
            ) : (
              <EmptyState title="No funding transactions yet">
                Pending and completed payments will appear here.
              </EmptyState>
            ))}
        </BuyerPanel>
        <Dialog
          open={bankSetup}
          onClose={() => setBankSetup(false)}
          title="Create your transfer account"
          presentation="sheet"
        >
          {bankSetup && (
            <BankAccountSetup
              onDone={() => {
                setBankSetup(false);
                reload();
              }}
            />
          )}
        </Dialog>
        <BuyerPanel>
          <h2>Wallet activity</h2>
          <p>Money added, reserved, released and paid from your wallet.</p>
          <Button variant="secondary" onClick={reload}>
            Refresh wallet
          </Button>
          {data &&
            (data.ledgerHistory.items.length ? (
              <BuyerStack>
                {data.ledgerHistory.items.map((item) => (
                  <div key={item.id}>
                    <MoneyLine
                      label={walletActivityLabels[item.operation]}
                      value={formatNaira(item.amountKobo)}
                    />
                    <p>
                      Available balance change:{' '}
                      {item.availableDeltaKobo < 0 ? '−' : '+'}
                      {formatNaira(Math.abs(item.availableDeltaKobo))} ·{' '}
                      {new Date(item.createdAt).toLocaleString('en-NG', {
                        timeZone: 'Africa/Lagos',
                      })}{' '}
                      WAT
                    </p>
                  </div>
                ))}
                <BuyerRow>
                  {ledgerCursor && (
                    <Button
                      variant="ghost"
                      onClick={() => setLedgerCursor(undefined)}
                    >
                      Newest wallet activity
                    </Button>
                  )}
                  {data.ledgerHistory.nextCursor && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setLedgerCursor(
                          data.ledgerHistory.nextCursor ?? undefined,
                        )
                      }
                    >
                      Older wallet activity
                    </Button>
                  )}
                </BuyerRow>
              </BuyerStack>
            ) : (
              <EmptyState title="No wallet activity yet">
                Your credits and bid reservations will appear here.
              </EmptyState>
            ))}
        </BuyerPanel>
      </BuyerStack>
    </BuyerPage>
  );
}
function PriceAccount({ account }: { account: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <p className="agn-price">{account}</p>
      <Button
        variant="secondary"
        onClick={() => {
          void navigator.clipboard
            .writeText(account)
            .then(() => {
              setCopied(true);
              setFailed(false);
            })
            .catch(() => setFailed(true));
        }}
      >
        {copied ? 'Account number copied' : 'Copy account number'}
      </Button>
      {failed && (
        <p role="status">
          Copy is unavailable. Select the account number above and copy it.
        </p>
      )}
    </>
  );
}
function BankAccountSetup({ onDone }: { onDone: () => void }) {
  const session = useBuyer();
  const [bankReady, setBankReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!session.tokens || busy) return;
        const form = event.currentTarget;
        const fields = new FormData(form);
        setBusy(true);
        const input: VirtualAccountInput = {
          firstName: String(fields.get('firstName')),
          lastName: String(fields.get('lastName')),
          phone: String(fields.get('phone')),
          bvn: String(fields.get('bvn')),
          bankCode: String(fields.get('bankCode')),
          accountNumber: String(fields.get('accountNumber')),
          consent: true,
          feePolicy: 'paystack-dva-v1',
        };
        const credentials = {
          accessToken: session.tokens.accessToken,
          deviceId: session.deviceId,
        };
        // Clear the visible BVN immediately; never persist identity details in browser storage.
        const bvn = form.elements.namedItem('bvn');
        if (bvn instanceof HTMLInputElement) bvn.value = '';
        void createPaymentClient(apiUrl, credentials)
          .assignAccount(input)
          .then(() => {
            form.reset();
            onDone();
            setMessage('Account request received. Check its status above.');
          })
          .catch(() =>
            setMessage(
              'The account could not be created. Check your details or try again when bank verification is available.',
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      <BuyerStack>
        <p>
          Create a personal transfer account using your bank details. Your BVN
          is sent only for bank verification and is not displayed in your
          account.
        </p>
        <Input
          name="firstName"
          label="First name"
          required
          autoComplete="given-name"
        />
        <Input
          name="lastName"
          label="Last name"
          required
          autoComplete="family-name"
        />
        <Input
          name="phone"
          label="Nigerian phone number"
          placeholder="0803 123 4567"
          required
          type="tel"
          autoComplete="tel"
        />
        <Input
          name="bvn"
          type="password"
          label="BVN"
          required
          inputMode="numeric"
          pattern="[0-9]{11}"
          maxLength={11}
          autoComplete="off"
        />
        <BankPicker disabled={busy} onAvailable={setBankReady} />
        <Input
          name="accountNumber"
          label="Your existing bank account number"
          required
          inputMode="numeric"
          pattern="[0-9]{10}"
          maxLength={10}
        />
        <Consent required disabled={busy}>
          I consent to bank verification and understand that the processing fee
          is deducted from each transfer before wallet credit.
        </Consent>
        <Button type="submit" busy={busy} disabled={!bankReady}>
          Request personal transfer account
        </Button>
        {message && <p role="status">{message}</p>}
      </BuyerStack>
    </form>
  );
}
