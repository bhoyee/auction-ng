'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  WalletTag,
  WalletMethodBadge,
  WalletPagination,
} from '@auction-ng/ui/web/wallet-workspace';
import { PortalWalletSummary } from '@auction-ng/ui/web/buyer-portal';
import { apiUrl, useBuyer } from '../lib/session';
import { useWalletRead } from '../lib/wallet-read';
import { WalletWithdrawals } from './wallet-withdrawals';
import { createWalletControlsClient } from '@auction-ng/api-client/wallet-controls';
import { canCancelDeposit } from '@auction-ng/shared/payment-schemas';

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
  const [fundingPages, setFundingPages] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [activityPages, setActivityPages] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const cursor = fundingPages.at(-1),
    ledgerCursor = activityPages.at(-1);
  const [withdrawalRequest, setWithdrawalRequest] = useState(0);
  const [withdrawalAvailable, setWithdrawalAvailable] = useState(false);
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
  const readControls = useCallback(
    (credentials: { accessToken: string; deviceId: string }) =>
      createWalletControlsClient(apiUrl, credentials).get(),
    [],
  );
  const controls = useWalletRead(readControls);
  const depositsEnabled =
    controls.data?.depositsEnabled === true && !controls.error;
  const [tab, setTab] = useState('funding');
  const [checkingId, setCheckingId] = useState<string>();
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
  const [cancelTarget, setCancelTarget] = useState<{
      id: string;
      amount: number;
    }>(),
    [cancelBusy, setCancelBusy] = useState(false),
    [cancelError, setCancelError] = useState(''),
    [cancelNotice, setCancelNotice] = useState('');
  const currentOwner = useRef(session.tokens?.user.id);
  currentOwner.current = session.tokens?.user.id;
  useEffect(() => {
    setCancelTarget(undefined);
    setCancelError('');
    setCancelNotice('');
    setCancelBusy(false);
    setCheckingId(undefined);
    setPendingMessage('');
  }, [session.tokens?.user.id]);
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
    if (!credentials || !amount || busy || !depositsEnabled) return;
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
    if (!credentials || !quote || busy || !depositsEnabled) return;
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
  const confirmPayment = async (target: {
    id: string;
    fundingMethod: string;
    transferKobo: number;
  }) => {
    if (!credentials || checkingId || cancelBusy || busy) return;
    const owner = currentOwner.current;
    setCheckingId(target.id);
    setPendingMessage('');
    setCancelNotice('');
    try {
      const run = (accessToken: string) => {
        const payments = createPaymentClient(apiUrl, {
          ...credentials,
          accessToken,
        });
        return target.fundingMethod === 'checkout_transfer'
          ? payments.confirmTransfer(target.id)
          : payments.confirmCard(target.id);
      };
      let result;
      try {
        result = await run(credentials.accessToken);
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
        const fresh = await session.renewSession(credentials.accessToken);
        if (!fresh || fresh.user.id !== owner) throw cause;
        result = await run(fresh.accessToken);
      }
      if (currentOwner.current !== owner) return;
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
        `${formatNaira(target.transferKobo)} deposit: ` +
          (result.status === 'credited'
            ? 'Payment confirmed. Your wallet has been credited.'
            : result.status === 'failed'
              ? 'This payment failed. Your wallet has not been credited.'
              : result.status === 'cancelled'
                ? 'This checkout was cancelled in LotVanta. Any payment confirmed later will still be credited to your wallet.'
                : 'Payment is still pending. Check again shortly.'),
      );
      if (result.status !== 'pending') {
        try {
          if (
            sessionStorage.getItem('auction-ng-pending-payment') === target.id
          ) {
            sessionStorage.removeItem('auction-ng-pending-payment');
            sessionStorage.removeItem('auction-ng-pending-payment-method');
            checkout.current = null;
          }
        } catch {
          /* Status verification does not depend on browser storage. */
        }
      }
      reload();
    } catch (cause) {
      if (currentOwner.current !== owner) return;
      setPendingTone('error');
      setPendingMessage(
        `${formatNaira(target.transferKobo)} deposit: ` +
          (cause instanceof ApiError && cause.status === 429
            ? 'Too many checks. Wait before checking this payment again.'
            : 'Payment could not be checked. Retry this payment; do not pay again. Funds are credited only after verification.'),
      );
    } finally {
      if (currentOwner.current === owner) setCheckingId(undefined);
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
      {pendingMessage && (
        <Toast
          floating
          emphasis
          tone={pendingTone}
          onClose={() => setPendingMessage('')}
        >
          {pendingMessage}
        </Toast>
      )}
      {cancelNotice && (
        <Toast tone="success" emphasis onClose={() => setCancelNotice('')}>
          {cancelNotice}
        </Toast>
      )}
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
            'Action',
          ]}
        >
          {funding.data.items.map((item) => (
            <tr key={item.id}>
              <td>{date(item.createdAt)}</td>
              <td>
                <WalletMethodBadge method={item.fundingMethod} />
              </td>
              <td>{formatNaira(item.transferKobo)}</td>
              <td>{formatNaira(item.feeKobo)}</td>
              <td>
                <strong>{formatNaira(item.creditKobo)}</strong>
              </td>
              <td>
                <WalletTag
                  tone={
                    item.status === 'credited'
                      ? 'success'
                      : item.status === 'failed' || item.status === 'cancelled'
                        ? 'danger'
                        : item.status === 'verified'
                          ? 'info'
                          : 'warning'
                  }
                >
                  {item.status === 'credited'
                    ? 'Credited'
                    : item.status === 'cancelled'
                      ? 'Cancelled'
                      : item.status === 'failed'
                        ? 'Failed'
                        : item.status === 'verified'
                          ? 'Verified'
                          : 'Pending'}
                </WalletTag>
              </td>
              <td>
                {canCancelDeposit(item.status, item.fundingMethod) ? (
                  <BuyerRow>
                    <Button
                      size="small"
                      busy={checkingId === item.id}
                      disabled={!!checkingId || cancelBusy || busy}
                      onClick={() => void confirmPayment(item)}
                    >
                      Check status
                    </Button>
                    <Button
                      size="small"
                      variant="danger"
                      disabled={cancelBusy || !!checkingId}
                      onClick={() => {
                        setCancelError('');
                        setCancelNotice('');
                        setPendingMessage('');
                        setCancelTarget({
                          id: item.id,
                          amount: item.transferKobo,
                        });
                      }}
                    >
                      Cancel checkout
                    </Button>
                  </BuyerRow>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </WalletTable>
      ) : (
        <EmptyState title="No funding transactions yet">
          Pending and completed payments will appear here.
        </EmptyState>
      )}
      <WalletPagination
        page={fundingPages.length}
        size={20}
        hasNext={!!funding.data?.nextCursor}
        onPrevious={() =>
          setFundingPages((current) =>
            current.length > 1 ? current.slice(0, -1) : current,
          )
        }
        onNext={() => {
          if (funding.data?.nextCursor)
            setFundingPages((current) => [
              ...current,
              funding.data?.nextCursor ?? undefined,
            ]);
        }}
      />
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
              <td>
                <WalletTag
                  tone={
                    ['topup', 'refund', 'release'].includes(item.operation)
                      ? 'success'
                      : item.operation === 'hold'
                        ? 'warning'
                        : 'info'
                  }
                >
                  {item.purpose === 'bid_cancellation'
                    ? item.operation === 'capture'
                      ? 'Bid cancellation fee'
                      : item.operation === 'hold'
                        ? 'Cancellation fee reservation'
                        : 'Cancellation funds released'
                    : walletActivityLabels[item.operation]}
                </WalletTag>
              </td>
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
      <WalletPagination
        page={activityPages.length}
        size={20}
        hasNext={!!activity.data?.nextCursor}
        onPrevious={() =>
          setActivityPages((current) =>
            current.length > 1 ? current.slice(0, -1) : current,
          )
        }
        onNext={() => {
          if (activity.data?.nextCursor)
            setActivityPages((current) => [
              ...current,
              activity.data?.nextCursor ?? undefined,
            ]);
        }}
      />
      <BuyerRow>
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
              action={
                <Button
                  className="agn-wallet-withdraw"
                  aria-label="Withdraw to bank"
                  disabled={!withdrawalAvailable || balance.error}
                  onClick={() => setWithdrawalRequest((value) => value + 1)}
                >
                  Withdraw
                </Button>
              }
            />
          )}
        </WalletBalanceArea>
        <BuyerPanel>
          <h2>Add funds</h2>
          {controls.error && (
            <WalletNotice onRetry={controls.reload}>
              Payment availability could not be refreshed. Retry before adding
              funds.
            </WalletNotice>
          )}
          {controls.data && !controls.data.depositsEnabled && (
            <p role="status" className="agn-wallet-pause">
              New deposits are temporarily paused. Existing payments will still
              be confirmed.
            </p>
          )}
          <BuyerStack>
            <NairaInput
              label="Amount to Fund"
              prefix="₦"
              digitsOnly
              onAmountChange={(value) => {
                if (!checkout.current) {
                  setAmount(value);
                  setQuote(undefined);
                }
              }}
              disabled={busy || checkout.current !== null || !depositsEnabled}
            />
            <WalletPaymentSelect
              value={method}
              disabled={busy || checkout.current !== null || !depositsEnabled}
              onChange={(value) => {
                setMethod(value);
                setQuote(undefined);
              }}
            />
            <Button
              variant="primary"
              busy={busy}
              disabled={
                !amount || checkout.current !== null || !depositsEnabled
              }
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
                <Button
                  busy={busy}
                  disabled={!depositsEnabled}
                  onClick={() => void pay()}
                >
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

        <WalletWithdrawals
          key={session.tokens?.user.id ?? 'signed-out'}
          request={withdrawalRequest}
          onAvailabilityChange={setWithdrawalAvailable}
        />
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
        open={!!cancelTarget}
        title="Cancel deposit checkout?"
        onClose={() => {
          if (!cancelBusy) {
            setCancelTarget(undefined);
            setCancelError('');
          }
        }}
      >
        <BuyerStack>
          <p>
            Close this{' '}
            <strong>
              {cancelTarget ? formatNaira(cancelTarget.amount) : ''}
            </strong>{' '}
            checkout in LotVanta?
          </p>
          <p>
            This does not reverse a card payment or bank transfer already made.
            Any payment confirmed later will still be credited to your wallet.
          </p>
          {cancelError && (
            <Toast tone="error" emphasis onClose={() => setCancelError('')}>
              {cancelError}
            </Toast>
          )}
          <Button
            variant="danger"
            busy={cancelBusy}
            onClick={() =>
              void (async () => {
                if (!credentials || !cancelTarget || cancelBusy) return;
                const target = cancelTarget,
                  owner = currentOwner.current;
                setCancelBusy(true);
                setCancelError('');
                try {
                  const run = (accessToken: string) =>
                    createPaymentClient(apiUrl, {
                      ...credentials,
                      accessToken,
                    }).cancelCheckout(target.id);
                  let result;
                  try {
                    result = await run(credentials.accessToken);
                  } catch (cause) {
                    if (!(cause instanceof ApiError) || cause.status !== 401)
                      throw cause;
                    const fresh = await session.renewSession(
                      credentials.accessToken,
                    );
                    if (!fresh || fresh.user.id !== owner) throw cause;
                    result = await run(fresh.accessToken);
                  }
                  if (currentOwner.current !== owner) return;
                  setCancelTarget(undefined);
                  setCancelNotice(
                    result.status === 'credited'
                      ? 'Payment was already confirmed. Your wallet has been credited.'
                      : 'Checkout cancelled. Any payment confirmed later will still be credited to your wallet.',
                  );
                  try {
                    if (
                      sessionStorage.getItem('auction-ng-pending-payment') ===
                      target.id
                    ) {
                      sessionStorage.removeItem('auction-ng-pending-payment');
                      sessionStorage.removeItem(
                        'auction-ng-pending-payment-method',
                      );
                      checkout.current = null;
                      setQuote(undefined);
                    }
                  } catch {
                    /* Local tracking never determines payment settlement. */
                  }
                  funding.reload();
                  window.dispatchEvent(new Event('auction-ng-wallet-change'));
                } catch (cause) {
                  if (currentOwner.current === owner) {
                    setCancelError(
                      cause instanceof ApiError && cause.status === 409
                        ? 'This deposit is already completed or closed. Refresh its status before trying again.'
                        : cause instanceof ApiError && cause.status === 429
                          ? 'Too many requests. Wait before trying again.'
                          : 'Cancellation could not be confirmed. Check your connection and retry this same checkout.',
                    );
                    funding.reload();
                  }
                } finally {
                  if (currentOwner.current === owner) setCancelBusy(false);
                }
              })()
            }
          >
            Cancel checkout
          </Button>
          <Button
            variant="secondary"
            disabled={cancelBusy}
            onClick={() => setCancelTarget(undefined)}
          >
            Keep checkout
          </Button>
        </BuyerStack>
      </Dialog>
    </BuyerPage>
  );
}
