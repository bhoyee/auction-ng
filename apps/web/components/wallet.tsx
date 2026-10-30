'use client';
import { useCallback, useRef, useState } from 'react';
import { createPaymentClient } from '@auction-ng/api-client/payments';
import { ApiError } from '@auction-ng/api-client/auth';
import { createWalletClient } from '@auction-ng/api-client/wallet';
import type { WalletHistory } from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import { Badge } from '@auction-ng/ui/web/auction';
import { Button } from '@auction-ng/ui/web/button';
import { Toast } from '@auction-ng/ui/web/toast';
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
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Tabs } from '@auction-ng/ui/web/tabs';
import {
  WalletBalanceArea,
  WalletHistoryPanel,
  WalletNotice,
  WalletPaymentSelect,
  WalletTable,
} from '@auction-ng/ui/web/wallet-workspace';
import { PortalWalletSummary } from '@auction-ng/ui/web/buyer-portal';
import { apiUrl, useBuyer } from '../lib/session';
import { useWalletRead } from '../lib/wallet-read';
import { WalletWithdrawals } from './wallet-withdrawals';

const walletActivityLabels: Record<
  WalletHistory['items'][number]['operation'],
  string
> = {
  topup: 'Funds added',
  debit: 'Payment',
  payout: 'Withdrawal',
  hold: 'Funds reserved',
  capture: 'Winning bid payment',
  release: 'Reservation released',
  refund: 'Refund',
};

export function Wallet() {
  const session = useBuyer();
  const [cursor, setCursor] = useState<string>();
  const [ledgerCursor, setLedgerCursor] = useState<string>();
  const readBalance = useCallback(
    async (credentials: { accessToken: string; deviceId: string }) => {
      const wallet = createWalletClient(apiUrl, credentials);
      return wallet.getBalance().catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 404)
          return wallet.openWallet();
        throw cause;
      });
    },
    [],
  );
  const readFunding = useCallback(
    (credentials: { accessToken: string; deviceId: string }) =>
      createPaymentClient(apiUrl, credentials).getHistory({
        limit: 20,
        cursor,
      }),
    [cursor],
  );
  const readActivity = useCallback(
    async (credentials: { accessToken: string; deviceId: string }) => {
      const wallet = createWalletClient(apiUrl, credentials);
      return wallet
        .getHistory({ limit: 20, cursor: ledgerCursor })
        .catch(async (cause: unknown) => {
          if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
          await readBalance(credentials);
          return wallet.getHistory({ limit: 20, cursor: ledgerCursor });
        });
    },
    [ledgerCursor, readBalance],
  );
  const balance = useWalletRead(readBalance, true);
  const funding = useWalletRead(readFunding);
  const activity = useWalletRead(readActivity);
  const [tab, setTab] = useState('funding');
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [pendingTone, setPendingTone] = useState<'success' | 'error' | 'info'>(
    'info',
  );
  const reload = () => {
    balance.reload();
    funding.reload();
    activity.reload();
  };
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
    setPendingMessage('');
    try {
      const id = sessionStorage.getItem('auction-ng-pending-payment');
      if (!id) {
        setPendingTone('info');
        setPendingMessage(
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
      setPendingTone(
        result.status === 'credited'
          ? 'success'
          : result.status === 'failed'
            ? 'error'
            : 'info',
      );
      window.dispatchEvent(new Event('auction-ng-notifications-change'));
      setPendingMessage(
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
      setPendingTone('error');
      setPendingMessage(
        'Payment could not be checked. Try again; funds are only credited after verification.',
      );
    } finally {
      setBusy(false);
    }
  };
  const date = (value: string) =>
    new Date(value).toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  const fundingPanel = (
    <>
      {funding.error && (
        <WalletNotice onRetry={funding.reload}>
          Funding history could not be refreshed. Retry to see the latest
          payments.
        </WalletNotice>
      )}
      {!funding.data ? (
        funding.error ? null : (
          <BuyerSkeleton />
        )
      ) : funding.data.items.length ? (
        <WalletTable
          label="Funding history"
          columns={[
            'Date (WAT)',
            'Payment method',
            'Paid',
            'Fee',
            'Wallet credit',
            'Status',
          ]}
        >
          {funding.data.items.map((item) => (
            <tr key={item.id}>
              <td>{date(item.createdAt)}</td>
              <td>
                {item.fundingMethod === 'card'
                  ? 'Card'
                  : item.fundingMethod === 'checkout_transfer'
                    ? 'One-time transfer'
                    : 'Personal account transfer'}
              </td>
              <td>{formatNaira(item.transferKobo)}</td>
              <td>{formatNaira(item.feeKobo)}</td>
              <td>
                <strong>{formatNaira(item.creditKobo)}</strong>
              </td>
              <td>
                <Badge>{item.status}</Badge>
              </td>
            </tr>
          ))}
        </WalletTable>
      ) : (
        <EmptyState title="No funding transactions yet">
          Pending and completed payments will appear here.
        </EmptyState>
      )}
      <BuyerRow>
        <Button
          variant="secondary"
          disabled={!cursor}
          onClick={() => setCursor(undefined)}
        >
          Back to newest
        </Button>
        <Button
          variant="secondary"
          disabled={!funding.data?.nextCursor}
          onClick={() => setCursor(funding.data?.nextCursor ?? undefined)}
        >
          Next page
        </Button>
      </BuyerRow>
    </>
  );
  const activityPanel = (
    <>
      {activity.error && (
        <WalletNotice onRetry={activity.reload}>
          Wallet activity could not be refreshed. Retry to see the latest
          entries.
        </WalletNotice>
      )}
      {!activity.data ? (
        activity.error ? null : (
          <BuyerSkeleton />
        )
      ) : activity.data.items.length ? (
        <WalletTable
          label="Wallet activity"
          columns={[
            'Date (WAT)',
            'Description',
            'Amount',
            'Available balance change',
          ]}
        >
          {activity.data.items.map((item) => (
            <tr key={item.id}>
              <td>{date(item.createdAt)}</td>
              <td>{walletActivityLabels[item.operation]}</td>
              <td>{formatNaira(item.amountKobo)}</td>
              <td>
                <strong>
                  {item.availableDeltaKobo < 0 ? '\u2212' : '+'}
                  {formatNaira(Math.abs(item.availableDeltaKobo))}
                </strong>
              </td>
            </tr>
          ))}
        </WalletTable>
      ) : (
        <EmptyState title="No wallet activity yet">
          Your credits and bid reservations will appear here.
        </EmptyState>
      )}
      <BuyerRow>
        <Button
          variant="secondary"
          disabled={!ledgerCursor}
          onClick={() => setLedgerCursor(undefined)}
        >
          Newest wallet activity
        </Button>
        <Button
          variant="secondary"
          disabled={!activity.data?.nextCursor}
          onClick={() =>
            setLedgerCursor(activity.data?.nextCursor ?? undefined)
          }
        >
          Older wallet activity
        </Button>
        <Button variant="ghost" onClick={activity.reload}>
          Refresh wallet
        </Button>
      </BuyerRow>
    </>
  );
  return (
    <BuyerPage
      layout="wallet"
      title="Wallet"
      action={<Badge>Test payments</Badge>}
      description="Manage your funds, payments and bid reservations."
    >
      <BuyerStack>
        {balance.error && (
          <WalletNotice onRetry={balance.reload}>
            Your balance could not be refreshed. Last confirmed values are
            shown; reconnect and retry before paying.
          </WalletNotice>
        )}
        <WalletBalanceArea>
          {balance.error && !balance.data ? (
            <ErrorState onRetry={balance.reload} />
          ) : !balance.data ? (
            <BuyerSkeleton />
          ) : (
            <PortalWalletSummary
              available={balance.data.availableKobo}
              held={balance.data.heldKobo}
              total={balance.data.totalKobo}
            />
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setPendingMessage('');
              setPendingOpen(true);
            }}
          >
            Check pending payment
          </Button>
        </WalletBalanceArea>
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
            <WalletPaymentSelect
              value={method}
              disabled={busy || checkout.current !== null}
              onChange={(value) => {
                setMethod(value);
                setQuote(undefined);
              }}
            />
            <Button
              variant="primary"
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
            {message && <p role="status">{message}</p>}
          </BuyerStack>
        </BuyerPanel>

        <WalletWithdrawals key={session.tokens?.user.id ?? 'signed-out'} />
        <WalletHistoryPanel>
          <h2>Transactions</h2>
          <Tabs
            label="Wallet transactions"
            value={tab}
            onChange={setTab}
            items={[
              {
                value: 'funding',
                label: 'Funding history',
                panel: fundingPanel,
              },
              {
                value: 'activity',
                label: 'Wallet activity',
                panel: activityPanel,
              },
            ]}
          />
        </WalletHistoryPanel>
      </BuyerStack>
      <Dialog
        open={pendingOpen}
        onClose={() => setPendingOpen(false)}
        title="Check pending payment"
      >
        <BuyerStack>
          <p>
            Check the latest checkout started in this browser. Your wallet is
            credited only after payment verification.
          </p>
          <Button busy={busy} onClick={() => void confirmPayment()}>
            Check payment status
          </Button>
          {pendingMessage && (
            <Toast
              emphasis
              tone={pendingTone}
              onClose={() => setPendingMessage('')}
            >
              {pendingMessage}
            </Toast>
          )}
        </BuyerStack>
      </Dialog>
    </BuyerPage>
  );
}
