'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPreBidClient,
  readUpcomingLot,
} from '@auction-ng/api-client/prebids';
import { ApiError } from '@auction-ng/api-client/auth';
import { readWalletBalance } from '@auction-ng/api-client/wallet-balance';
import { retailDiscountPercent } from '@auction-ng/ui/presentation';
import {
  calculateInvoiceLine,
  effectiveAuctionFeeRules,
} from '@auction-ng/shared/fees';
import { formatNaira } from '@auction-ng/shared/money';
import type {
  PreBid,
  PreBidChange,
  PreBidCancel,
} from '@auction-ng/shared/prebid-schemas';
import type { AuctionFeeQuote } from '@auction-ng/shared/auction-fee-schemas';
import { ConditionBadge, Price } from '@auction-ng/ui/web/auction';
import { LaunchCountdown, LaunchTime } from '@auction-ng/ui/web/upcoming';
import { LotAuctionPanel } from '@auction-ng/ui/web/lot-detail';
import { Button } from '@auction-ng/ui/web/button';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Toast } from '@auction-ng/ui/web/toast';
import { BuyerStack, MoneyLine } from '@auction-ng/ui/web/buyer';
import { apiUrl, useBuyer } from '../lib/session';
import { useServerClock } from '../lib/server-clock';
import { useOnline } from '../lib/network';
import type { LotDetailData } from './lot-detail';
export function PreBidPanel({
  lot,
  toolbar,
  quote,
}: {
  lot: LotDetailData;
  toolbar: ReactNode;
  quote?: AuctionFeeQuote;
}) {
  const session = useBuyer(),
    online = useOnline(),
    router = useRouter(),
    now = useServerClock();
  const [owned, setOwned] = useState<PreBid | null>(),
    [amount, setAmount] = useState<number>(),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [reload, setReload] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [available, setAvailable] = useState<number>();
  const [balanceError, setBalanceError] = useState(false);
  const [balanceVersion, setBalanceVersion] = useState(0);
  useEffect(() => {
    let active = true,
      running = false;
    setAvailable(undefined);
    if (!session.tokens) return;
    const credentials = {
      accessToken: session.tokens.accessToken,
      deviceId: session.deviceId,
    };
    const read = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const balance = await readWalletBalance(apiUrl, credentials);
        if (active) {
          setAvailable(balance.availableKobo);
          setBalanceError(false);
        }
      } catch (failure) {
        if (active) {
          setAvailable(
            failure instanceof ApiError && failure.status === 404
              ? 0
              : undefined,
          );
          setBalanceError(
            !(failure instanceof ApiError && failure.status === 404),
          );
        }
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    window.addEventListener('auction-ng-wallet-change', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
      window.removeEventListener('auction-ng-wallet-change', read);
    };
  }, [session.tokens?.accessToken, session.deviceId, balanceVersion]);
  const pending = useRef<
    | {
        kind: 'change';
        input: PreBidChange;
        fee: ReturnType<typeof calculateInvoiceLine>;
        rules: ReturnType<typeof effectiveAuctionFeeRules>;
      }
    | { kind: 'cancel'; input: PreBidCancel }
    | undefined
  >(undefined);
  const policy = quote?.policy;
  const currentRules = policy ? effectiveAuctionFeeRules(policy) : undefined;
  const rules =
    pending.current?.kind === 'change' ? pending.current.rules : currentRules;
  let fee: ReturnType<typeof calculateInvoiceLine> | undefined;
  try {
    if (pending.current?.kind === 'change') fee = pending.current.fee;
    else if (amount && rules) fee = calculateInvoiceLine(amount, rules);
  } catch {
    /* Unsafe totals cannot be submitted. */
  }
  const discount = retailDiscountPercent(
    lot.startPriceKobo,
    lot.retailPriceKobo,
  );
  // Editing replaces this lot's existing hold; it does not need a second full reservation.
  const shortfall =
    fee && available !== undefined && owned !== undefined
      ? Math.max(
          0,
          Math.max(
            0,
            fee.totalKobo - (owned?.status === 'active' ? owned.totalKobo : 0),
          ) - available,
        )
      : 0;
  const oldVersion = useRef(policy?.version);
  useEffect(() => {
    if (
      oldVersion.current &&
      policy?.version !== oldVersion.current &&
      !pending.current
    )
      setReview(false);
    oldVersion.current = policy?.version;
  }, [policy?.version]);
  useEffect(() => {
    let active = true,
      running = false;
    const read = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        if (session.tokens) {
          const value = await createPreBidClient(apiUrl, {
            accessToken: session.tokens.accessToken,
            deviceId: session.deviceId,
          }).read(lot.id);
          if (active) setOwned(value.preBid);
        } else if (active) setOwned(null);
        const current = await readUpcomingLot(apiUrl, lot.id);
        if (
          active &&
          (current.status !== 'scheduled' ||
            current.startsAt !== lot.startsAt ||
            current.endsAt !== lot.endsAt)
        )
          router.refresh();
      } catch (failure) {
        if (active && failure instanceof ApiError && failure.status === 404) {
          setCancelled(true);
          setError(
            'This upcoming auction was cancelled or removed. Any pre-bid reservation is being released.',
          );
          return;
        }
        if (active)
          setError(
            'This pre-bid could not be refreshed. Reconnect and retry before changing it.',
          );
      } finally {
        running = false;
      }
    };
    setOwned(undefined);
    void read();
    const timer = setInterval(() => void read(), 5000);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
    };
  }, [
    lot.id,
    lot.startsAt,
    lot.endsAt,
    session.tokens?.accessToken,
    session.deviceId,
    reload,
    router,
  ]);
  const beforeLaunch =
    !cancelled && now > 0 && !!lot.startsAt && now < Date.parse(lot.startsAt);
  const run = async (kind: 'change' | 'cancel') => {
    if (busy || !session.tokens) return;
    const retrying = !!pending.current;
    if (!pending.current) {
      if (kind === 'change') {
        if (!fee || !amount || !policy || !rules || owned === undefined) return;
        pending.current = {
          kind,
          fee,
          rules,
          input: {
            maxKobo: amount,
            feeVersion: policy.version,
            expectedRevision: owned?.revision ?? 0,
            idempotencyKey: crypto.randomUUID(),
          },
        };
      } else {
        if (!owned) return;
        pending.current = {
          kind,
          input: {
            expectedRevision: owned.revision,
            idempotencyKey: crypto.randomUUID(),
          },
        };
      }
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const client = createPreBidClient(apiUrl, {
          accessToken: session.tokens.accessToken,
          deviceId: session.deviceId,
        }),
        operation = pending.current;
      const result =
        operation.kind === 'change'
          ? await client.change(lot.id, operation.input)
          : await client.cancel(lot.id, operation.input);
      setOwned(result.preBid);
      setSuccess(
        operation.kind === 'change'
          ? 'Pre-bid saved. Your maximum plus fees is reserved.'
          : 'Pre-bid cancelled. Reserved funds are available in your wallet.',
      );
      pending.current = undefined;
      setReview(false);
      window.dispatchEvent(new Event('auction-ng-wallet-change'));
    } catch (e) {
      if (
        e instanceof ApiError &&
        ([400, 409, 422].includes(e.status) || (e.status === 403 && !retrying))
      ) {
        pending.current = undefined;
        setReview(false);
        setReload((v) => v + 1);
        setError(
          e.code === 'INSUFFICIENT_FUNDS'
            ? 'Insufficient available wallet funds. Add funds, then review your pre-bid again.'
            : 'Pre-bid not saved. Check the launch time, available wallet funds and current fees, then review again.',
        );
      } else
        setError(
          'The result could not be confirmed. Retry this same request before changing your pre-bid.',
        );
    } finally {
      setBusy(false);
    }
  };
  return (
    <LotAuctionPanel>
      {toolbar}
      <BuyerStack>
        <div className="agn-prebid-summary">
          <div className="agn-detail-price-row">
            <div className="agn-detail-price-group">
              <Price
                kobo={lot.startPriceKobo}
                label="Starting price"
                flash={false}
              />
              {lot.retailPriceKobo > lot.startPriceKobo && (
                <div className="agn-detail-retail">
                  {discount !== undefined && (
                    <span
                      className="agn-detail-discount"
                      aria-label={`${discount}% below retail estimate`}
                    >
                      −{discount}%
                    </span>
                  )}
                  <s>{formatNaira(lot.retailPriceKobo)}</s>
                  <small>Retail estimate</small>
                </div>
              )}
            </div>
            <ConditionBadge condition={lot.condition} />
          </div>
          {lot.startsAt && (
            <>
              <LaunchTime startsAt={lot.startsAt} />
              {cancelled ? (
                <strong>Upcoming auction cancelled</strong>
              ) : (
                <LaunchCountdown
                  startsAt={lot.startsAt}
                  serverNow={now}
                  detail
                />
              )}
            </>
          )}
        </div>
        <p className="agn-detail-bid-notice">
          A pre-bid is a private automatic limit. Your maximum plus fees is
          reserved now. It enters bidding at launch; winning is decided when the
          auction closes.
        </p>
        {error && (
          <Toast tone="error" onClose={() => setError('')}>
            {error}
          </Toast>
        )}
        {success && (
          <Toast tone="success" onClose={() => setSuccess('')}>
            {success}
          </Toast>
        )}
        {!session.tokens ? (
          <a
            className="agn-button agn-button--primary"
            href={'/sign-in?next=' + encodeURIComponent('/lots/' + lot.id)}
          >
            Sign in to pre-bid
          </a>
        ) : (
          <>
            {owned?.status === 'active' && (
              <p className="agn-detail-bid-notice">
                <strong>
                  Your private limit: {formatNaira(owned.maxKobo)}
                </strong>
                <br />
                Reserved including fees: {formatNaira(owned.totalKobo)}
              </p>
            )}
            {owned?.status === 'accepted' && (
              <p role="status">
                Your pre-bid has entered the live auction. Loading the latest
                bidding state…
              </p>
            )}
            <div className="agn-prebid-form">
              <div className="agn-prebid-entry">
                <NairaInput
                  label="Your private pre-bid limit (₦)"
                  prefix="₦"
                  placeholder="0"
                  digitsOnly
                  disabled={
                    busy || !!pending.current || !beforeLaunch || !online
                  }
                  onAmountChange={setAmount}
                />
                <Button
                  disabled={
                    busy ||
                    !online ||
                    (!pending.current &&
                      (!beforeLaunch ||
                        owned === undefined ||
                        !fee ||
                        !amount ||
                        amount < lot.startPriceKobo))
                  }
                  onClick={() =>
                    pending.current
                      ? void run(pending.current.kind)
                      : setReview(true)
                  }
                >
                  {pending.current ? 'Retry pending pre-bid' : 'Review pre-bid'}
                </Button>
              </div>
              <p className="agn-hint">
                At least <strong>{formatNaira(lot.startPriceKobo)}</strong>.
                Change or cancel before launch. Editing your limit gives it a
                new place in the pre-bid order.
              </p>
              <div className="agn-prebid-actions">
                {owned?.status === 'active' && (
                  <Button
                    variant="danger"
                    disabled={
                      busy || !beforeLaunch || !online || !!pending.current
                    }
                    onClick={() => void run('cancel')}
                  >
                    Cancel pre-bid
                  </Button>
                )}
              </div>
              {shortfall > 0 && beforeLaunch && !pending.current && (
                <div className="agn-detail-bid-notice">
                  <p>
                    <strong>
                      Add {formatNaira(shortfall)} to cover your limit and fees.
                    </strong>
                  </p>
                  <a
                    href="/wallet"
                    className="agn-button agn-detail-wallet-action"
                  >
                    Top up wallet
                  </a>
                </div>
              )}
              {balanceError && (
                <Toast tone="error" onClose={() => setBalanceError(false)}>
                  Your wallet balance could not be checked.{' '}
                  <Button
                    size="small"
                    onClick={() => setBalanceVersion((v) => v + 1)}
                  >
                    Retry wallet balance
                  </Button>
                </Toast>
              )}
            </div>
          </>
        )}
        {review && fee && rules && (
          <Dialog
            open
            title="Confirm your pre-bid"
            onClose={() => {
              if (!busy) setReview(false);
            }}
          >
            <BuyerStack>
              {error && (
                <Toast tone="error" onClose={() => setError('')}>
                  {error}
                </Toast>
              )}
              <MoneyLine
                label="Private maximum"
                value={formatNaira(fee.hammerKobo)}
              />
              <MoneyLine
                label={`Service charge (${rules.premiumBps / 100}%)`}
                value={formatNaira(fee.premiumKobo)}
              />
              <MoneyLine label="Lot fee" value={formatNaira(fee.lotFeeKobo)} />
              <MoneyLine
                label={`VAT on fees (${rules.vatBps / 100}%)`}
                value={formatNaira(fee.vatKobo)}
              />
              <MoneyLine
                label="Wallet reservation"
                total
                value={formatNaira(fee.totalKobo)}
              />
              <p className="agn-detail-bid-notice">
                Automatic bidding starts at launch. Your limit stays private.
                You can change or cancel before the launch time.
              </p>
              <Button
                disabled={
                  busy || !online || (!beforeLaunch && !pending.current)
                }
                onClick={() => void run('change')}
              >
                {pending.current
                  ? 'Check pending pre-bid'
                  : 'Confirm pre-bid ' + formatNaira(fee.hammerKobo)}
              </Button>
            </BuyerStack>
          </Dialog>
        )}
      </BuyerStack>
    </LotAuctionPanel>
  );
}
