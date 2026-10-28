'use client';
import { useEffect, useRef, useState } from 'react';
import { createPurchaseClient } from '@auction-ng/api-client';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  calculateFixedPrice,
  quotePurchasePayment,
  purchaseInputSchema,
  type PurchaseInput,
  type PurchaseStatus,
} from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import {
  PurchasePanel,
  PurchaseTotal,
} from '@auction-ng/ui/web/purchase-panel';
import { Button } from '@auction-ng/ui/web/button';
import { BuyerLink } from '@auction-ng/ui/web/buyer';
import { Countdown } from '@auction-ng/ui/web/auction';
import { apiUrl, useBuyer } from '../lib/session';
import { useOnline } from '../lib/network';
import { useServerClock } from '../lib/server-clock';

export function InstantPurchase({
  lotId,
  priceKobo,
  endsAt,
}: {
  lotId: string;
  priceKobo: number;
  endsAt: string;
}) {
  const session = useBuyer();
  const online = useOnline();
  const now = useServerClock();
  const [method, setMethod] = useState<PurchaseInput['method']>('wallet');
  const [purchase, setPurchase] = useState<PurchaseStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const terminal = useRef(false);
  const attempt = useRef<{ input: PurchaseInput; id?: string } | undefined>(
    undefined,
  );
  const storageKey = `auction-ng-purchase:${session.tokens?.user.id ?? 'guest'}:${lotId}`;
  const credentials = useRef(session);
  credentials.current = session;
  const quote = calculateFixedPrice(priceKobo);
  const external =
    method === 'wallet'
      ? { amountKobo: quote.totalKobo, feeKobo: 0 }
      : quotePurchasePayment(quote.totalKobo, method);
  function client() {
    const current = credentials.current;
    if (!current.tokens) throw new Error('Sign in again.');
    return createPurchaseClient(apiUrl, {
      accessToken: current.tokens.accessToken,
      deviceId: current.deviceId,
    });
  }
  useEffect(() => {
    attempt.current = undefined;
    terminal.current = false;
    setPurchase(undefined);
    setError('');
    if (!session.tokens) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { input?: unknown; id?: unknown };
        const parsed = purchaseInputSchema.safeParse(saved.input);
        if (parsed.success) {
          attempt.current = {
            input: parsed.data,
            ...(typeof saved.id === 'string' ? { id: saved.id } : {}),
          };
          setMethod(parsed.data.method);
        }
      }
    } catch {
      /* Keep retries in memory if storage is unavailable. */
    }
    let active = true;
    const refresh = async () => {
      if (
        !active ||
        terminal.current ||
        document.hidden ||
        !navigator.onLine ||
        !attempt.current?.id
      )
        return;
      try {
        const state = await client().get(attempt.current.id);
        if (active) {
          terminal.current = state.status !== 'pending';
          setPurchase(state);
        }
      } catch {
        /* Keep the reservation and offer an explicit status retry. */
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [session.tokens?.user.id, storageKey]);
  const saveAttempt = () => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(attempt.current));
    } catch {
      /* The current request remains stable in memory. */
    }
  };
  const run = async (action: 'start' | 'confirm' | 'cancel') => {
    setBusy(true);
    setError('');
    try {
      let value: PurchaseStatus;
      if (action === 'start') {
        if (!attempt.current) {
          attempt.current = {
            input: {
              idempotencyKey: crypto.randomUUID(),
              method,
              acceptedPriceKobo: quote.priceKobo,
              acceptedTaxKobo: quote.taxKobo,
              acceptedProcessingFeeKobo: external.feeKobo,
              acceptedTotalKobo: external.amountKobo,
            },
          };
          saveAttempt();
        }
        value = await client().start(lotId, attempt.current.input);
        attempt.current.id = value.id;
        saveAttempt();
      } else {
        const id = attempt.current?.id;
        if (!id) throw new Error('Check the existing request first.');
        value =
          action === 'confirm'
            ? await client().confirm(id)
            : await client().cancel(id);
      }
      setPurchase(value);
      terminal.current = value.status !== 'pending';
    } catch (cause) {
      if (
        action === 'start' &&
        cause instanceof ApiError &&
        cause.status === 422
      ) {
        // This response proves the wallet debit rolled back and the reservation was cancelled.
        attempt.current = undefined;
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Keep the retry state in memory. */
        }
      }
      setError(
        cause instanceof ApiError && cause.status === 409
          ? 'The item may be reserved, sold or have a changed price. Check the request before starting again.'
          : cause instanceof ApiError && cause.status === 422
            ? 'Your available wallet funds are too low. Check your wallet or choose card or transfer.'
            : 'We could not confirm this request. Retry the same request or check payment status; do not pay again.',
      );
    } finally {
      setBusy(false);
    }
  };
  const ended = now > 0 && now >= Date.parse(endsAt);
  return (
    <PurchasePanel>
      <p>
        Buy at the fixed price without waiting for bidding to end. No buyer
        premium or lot fee.
      </p>
      {!session.tokens ? (
        <>
          <PurchaseTotal
            priceKobo={quote.priceKobo}
            taxKobo={quote.taxKobo}
            feeKobo={0}
            totalKobo={quote.totalKobo}
          />
          <p>
            Card and transfer processing charges are shown after you choose how
            to pay.
          </p>
          <BuyerLink
            href={`/sign-in?${new URLSearchParams({ next: `/lots/${lotId}` })}`}
          >
            Sign in to buy
          </BuyerLink>
        </>
      ) : (
        <>
          {!purchase && (
            <fieldset
              className="agn-purchase-methods"
              disabled={busy || Boolean(attempt.current)}
            >
              <legend>How would you like to pay?</legend>
              {(
                [
                  ['wallet', 'Wallet funds'],
                  ['local_card', 'Nigerian card'],
                  ['international_card', 'International card'],
                  ['bank_transfer', 'Bank transfer'],
                ] as const
              ).map(([value, label]) => (
                <label className="agn-consent" key={value}>
                  <input
                    type="radio"
                    name={`purchase-method-${lotId}`}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <PurchaseTotal
            priceKobo={purchase?.priceKobo ?? quote.priceKobo}
            taxKobo={purchase?.taxKobo ?? quote.taxKobo}
            feeKobo={purchase?.processingFeeKobo ?? external.feeKobo}
            totalKobo={purchase?.amountKobo ?? external.amountKobo}
          />
          {purchase?.status === 'paid' ? (
            <>
              <p role="status">
                Your purchase is paid. The item is yours and bidding has
                stopped.
              </p>
              <BuyerLink href={`/invoices/${purchase.invoiceId}`}>
                View receipt and pickup details
              </BuyerLink>
            </>
          ) : purchase?.status === 'expired' ||
            purchase?.status === 'cancelled' ? (
            <>
              <p role="status">
                This reservation has{' '}
                {purchase.status === 'expired' ? 'expired' : 'been cancelled'}.
                Any verified payment received afterwards is credited to your
                wallet; it will not purchase this item.
              </p>
              <BuyerLink href="/wallet">Check wallet</BuyerLink>
              <Button
                variant="secondary"
                disabled={!online || ended}
                onClick={() => {
                  attempt.current = undefined;
                  terminal.current = false;
                  setPurchase(undefined);
                  setError('');
                  try {
                    sessionStorage.removeItem(storageKey);
                  } catch {
                    /* Retry remains available in memory. */
                  }
                }}
              >
                Start a new purchase
              </Button>
            </>
          ) : purchase ? (
            <>
              <p>
                Reserved while you pay. Time remaining:{' '}
                <Countdown
                  endsAt={Date.parse(purchase.expiresAt)}
                  serverNow={now}
                  live={online && now > 0}
                  showSeconds
                />
              </p>
              <p>
                The reservation ends after 10 minutes or at the auction
                deadline, whichever is earlier. A payment confirmed later
                becomes wallet credit, not a purchase.
              </p>
              {purchase.authorizationUrl && (
                <a
                  className="agn-button agn-button--primary"
                  href={purchase.authorizationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Continue to secure payment
                </a>
              )}
              <Button
                disabled={busy || !online}
                busy={busy}
                onClick={() => void run('confirm')}
              >
                Check payment status
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !online}
                onClick={() => void run('cancel')}
              >
                Cancel reservation
              </Button>
            </>
          ) : (
            <>
              <Button
                busy={busy}
                disabled={busy || !online || ended || !now}
                onClick={() => void run('start')}
              >
                {attempt.current
                  ? 'Check existing purchase request'
                  : method === 'wallet'
                    ? `Buy now ${formatNaira(external.amountKobo)}`
                    : `Reserve and pay ${formatNaira(external.amountKobo)}`}
              </Button>
              <p>
                Pay before the reservation expires. Payments confirmed after
                expiry go to your wallet instead of purchasing the item.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="agn-field-error">
              {error}
            </p>
          )}
          {!online && (
            <p role="status">
              You are offline. Reconnect before checking or making a payment.
            </p>
          )}
        </>
      )}
    </PurchasePanel>
  );
}
