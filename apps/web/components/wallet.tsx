'use client';
import { useCallback, useRef, useState } from 'react';
import { createPaymentClient } from '@auction-ng/api-client/payments';
import { ApiError } from '@auction-ng/api-client/auth';
import { createWalletClient } from '@auction-ng/api-client/wallet';
import type { WalletHistory } from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import { Badge } from '@auction-ng/ui/web/auction';
import { Button } from '@auction-ng/ui/web/button';
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
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Select } from '@auction-ng/ui/web/select';
import { PortalWalletSummary } from '@auction-ng/ui/web/buyer-portal';
import { apiUrl, useBuyer } from '../lib/session';
import { useWalletRead } from '../lib/wallet-read';

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
  const [cursor, setCursor] = useState<string>();
  const [ledgerCursor, setLedgerCursor] = useState<string>();
  const read = useCallback(
    async (credentials: { accessToken: string; deviceId: string }) => {
      const wallet = createWalletClient(apiUrl, credentials);
      const payments = createPaymentClient(apiUrl, credentials);
      const balance = await wallet.getBalance().catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 404)
          return wallet.openWallet();
        throw cause;
      });
      const [history, ledgerHistory] = await Promise.all([
        payments.getHistory({ limit: 20, cursor }),
        wallet.getHistory({ limit: 20, cursor: ledgerCursor }),
      ]);
      return { balance, history, ledgerHistory };
    },
    [cursor, ledgerCursor],
  );
  const { data, error, reload } = useWalletRead(read);
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
    method: 'transfer' | 'local' | 'international';
    fee: number;
    credit: number;
    policy:
      | 'paystack-transfer-v1'
      | 'paystack-card-local-v1'
      | 'paystack-card-international-v1';
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
        const value = await payments.quoteTransfer(amount);
        setQuote({
          charge: value.amountKobo,
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
    if (!credentials || !quote || busy) return;
    setBusy(true);
    try {
      checkout.current ??= {
        idempotencyKey: crypto.randomUUID(),
        amount: quote.charge,
        method,
        fee: quote.fee,
        credit: quote.credit,
        policy:
          method === 'transfer'
            ? 'paystack-transfer-v1'
            : method === 'local'
              ? 'paystack-card-local-v1'
              : 'paystack-card-international-v1',
      };
      const value = checkout.current;
      const payments = createPaymentClient(apiUrl, credentials);
      const accepted = {
        amountKobo: value.amount,
        acceptedFeeKobo: value.fee,
        acceptedCreditKobo: value.credit,
        consent: true as const,
        idempotencyKey: value.idempotencyKey,
      };
      const result =
        value.method === 'transfer'
          ? await payments.initializeTransfer({
              ...accepted,
              feePolicy: 'paystack-transfer-v1',
            })
          : await payments.initializeCard({
              ...accepted,
              cardType: value.method,
              feePolicy:
                value.method === 'local'
                  ? 'paystack-card-local-v1'
                  : 'paystack-card-international-v1',
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
      sessionStorage.setItem(
        'auction-ng-pending-payment-method',
        value.method === 'transfer' ? 'transfer' : 'card',
      );
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
          'No checkout is pending in this browser. Check your funding history below.',
        );
        return;
      }
      const payments = createPaymentClient(apiUrl, credentials);
      const result =
        sessionStorage.getItem('auction-ng-pending-payment-method') ===
        'transfer'
          ? await payments.confirmTransfer(id)
          : await payments.confirmCard(id);
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
        {error && data && (
          <p role="status">
            Your balance could not be refreshed. Last confirmed values are
            shown; reconnect and retry before paying.
          </p>
        )}
        {error && !data ? (
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
              <option value="transfer">One-time bank transfer</option>
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
                <Button busy={busy} onClick={() => void pay()}>
                  Accept fee and pay {formatNaira(quote.charge)}{' '}
                  {method === 'transfer' ? 'by transfer' : 'by card'}
                </Button>
                {method === 'transfer' && (
                  <p>
                    Paystack will show a temporary bank account for this
                    payment. Transfer the exact displayed amount before it
                    expires.
                  </p>
                )}
              </>
            )}
            <Button
              variant="secondary"
              busy={busy}
              onClick={() => void confirmPayment()}
            >
              Check pending payment
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
                      label={`${item.fundingMethod === 'card' ? 'Card' : item.fundingMethod === 'checkout_transfer' ? 'One-time transfer' : 'Personal account transfer'} · ${new Date(item.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT`}
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
