'use client';
import {
  useEffect,
  useState,
  useSyncExternalStore,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from 'react';
import {
  calculateInvoiceLine,
  effectiveAuctionFeeRules,
} from '@auction-ng/shared/fees';
import { useAuctionFees } from '../lib/auction-fees';
import { isBuyerEligible } from '@auction-ng/shared/buyer-eligibility';
import type { CatalogueDetail, AuctionFeePolicy } from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import {
  minNextBid,
  type BidMode,
  DEFAULT_BID_MODE,
} from '@auction-ng/shared/auction-rules';
import type { createBidClient } from '@auction-ng/api-client/bids';
import { readWalletBalance } from '@auction-ng/api-client/wallet-balance';
import { ApiError } from '@auction-ng/api-client/auth';
import { createUseLiveLot } from '@auction-ng/api-client/realtime-hook';
import type { RealtimeClient } from '@auction-ng/api-client/realtime';
import { ConditionBadge, Price } from '@auction-ng/ui/web/auction';
import { Button } from '@auction-ng/ui/web/button';
import { BuyerLink, BuyerStack, StickyBidBar } from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { ProductGallery } from '@auction-ng/ui/web/product-gallery';
import {
  Breadcrumbs,
  SectionHeading,
} from '@auction-ng/ui/web/marketplace-sections';
import { Share2, Gavel } from '@auction-ng/ui/web/icons';
import { Toast } from '@auction-ng/ui/web/toast';
import { BiddingMethod } from '@auction-ng/ui/web/bidding-method';
import { apiUrl, useBuyer } from '../lib/session';
import { ClientCatalogueGrid } from './client-catalogue-grid';
import { useBuyerRealtime } from '../lib/buyer-realtime';
import type { CardLot } from './catalogue-grid';
import type { createBidOperation } from '../lib/bid-operation';
import { useOnline } from '../lib/network';
import { useLotResult } from '../lib/lot-result';
import { InstantPurchase } from './instant-purchase';
const PreBidPanel = lazy(() =>
  import('./prebid-panel').then((module) => ({ default: module.PreBidPanel })),
);
import { AuctionPolicies } from '@auction-ng/ui/web/auction-policies';
import {
  WinningStatus,
  LotResultPanel,
  LotPriceSummary,
  LotAuctionPanel,
  LotPanelHeader,
  LotInformationSection,
  PickupLocationPanel,
} from '@auction-ng/ui/web/lot-detail';
const RecordedBids = lazy(() =>
  import('./recorded-bids').then((module) => ({
    default: module.RecordedBids,
  })),
);
import { LotWatch } from './lot-watch';
const useLiveLot = createUseLiveLot({ useEffect, useSyncExternalStore });
const BidReviewDialog = lazy(() =>
  import('./bid-review').then((module) => ({
    default: module.BidReview,
  })),
);
const FeeDetailsDialog = lazy(() =>
  import('@auction-ng/ui/web/bid-fee-details').then((module) => ({
    default: module.BidFeeDetails,
  })),
);
export type LotDetailData = Pick<
  CatalogueDetail,
  | 'id'
  | 'status'
  | 'title'
  | 'lotNumber'
  | 'description'
  | 'condition'
  | 'startPriceKobo'
  | 'retailPriceKobo'
  | 'endsAt'
  | 'bidCount'
  | 'fixedPriceKobo'
> & {
  startsAt?: string;
  category: Pick<CatalogueDetail['category'], 'id' | 'name'>;
  location: Pick<CatalogueDetail['location'], 'name' | 'address'>;
  images: { url: string; thumbnailUrl: string }[];
};
type Lot = LotDetailData;
function BidPanel({
  lot,
  client,
  toolbar,
  auctionFees,
}: {
  lot: Lot;
  client: RealtimeClient;
  toolbar: ReactNode;
  auctionFees: ReturnType<typeof useAuctionFees>;
}) {
  const session = useBuyer();
  const pendingPolicy = useRef<AuctionFeePolicy | undefined>(undefined);
  const policy = pendingPolicy.current ?? auctionFees.quote?.policy;
  const rules = policy ? effectiveAuctionFeeRules(policy) : undefined;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const online = useOnline();
  const live = useLiveLot(client, lot.id);
  const [now, setNow] = useState(0);
  const [amount, setAmount] = useState<number>();
  const [mode, setMode] = useState<BidMode>(DEFAULT_BID_MODE);
  const [review, setReview] = useState(false);
  const [showFees, setShowFees] = useState(false);
  const [feeErrorDismissed, setFeeErrorDismissed] = useState(false);
  useEffect(() => {
    setFeeErrorDismissed(false);
  }, [auctionFees.error]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: 'success' | 'error';
  }>();
  const [available, setAvailable] = useState<number>();
  const [balanceError, setBalanceError] = useState(false);
  const [balanceVersion, setBalanceVersion] = useState(0);
  const [inputVersion, setInputVersion] = useState(0);
  const bidEntry = useRef<HTMLDivElement>(null);
  const operation = useRef<ReturnType<
    typeof createBidOperation<
      Awaited<ReturnType<ReturnType<typeof createBidClient>['confirm']>>
    >
  > | null>(null);
  const previousFeeVersion = useRef<string | undefined>(undefined);
  useEffect(() => {
    const version = auctionFees.quote?.policy.version;
    if (
      previousFeeVersion.current &&
      version &&
      previousFeeVersion.current !== version &&
      !operation.current
    ) {
      setReview(false);
      setMessage(
        'Auction fees changed. Review the updated total before bidding.',
      );
    }
    previousFeeVersion.current = version;
  }, [auctionFees.quote?.policy.version]);
  useEffect(() => {
    let active = true;
    setAvailable(undefined);
    setBalanceError(false);
    if (session.tokens)
      void readWalletBalance(apiUrl, {
        accessToken: session.tokens.accessToken,
        deviceId: session.deviceId,
      })
        .then((value) => {
          if (active) setAvailable(value.availableKobo);
        })
        .catch((error: unknown) => {
          if (!active) return;
          if (error instanceof ApiError && error.status === 404)
            setAvailable(0);
          else setBalanceError(true);
        });
    return () => {
      active = false;
    };
  }, [session.tokens, session.deviceId, balanceVersion]);
  useEffect(() => {
    const refresh = () => setBalanceVersion((value) => value + 1);
    window.addEventListener('focus', refresh);
    window.addEventListener('auction-ng-wallet-change', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('auction-ng-wallet-change', refresh);
    };
  }, []);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const minimum = minNextBid(
    lot.startPriceKobo,
    live.lot?.currentPriceKobo ?? null,
  );
  let fee: ReturnType<typeof calculateInvoiceLine> | null = null;
  try {
    if (amount && Number.isSafeInteger(amount) && rules)
      fee = calculateInvoiceLine(amount, rules);
  } catch {
    /* Reject totals outside safe integer kobo. */
  }
  const connected = online && live.status === 'live' && live.lot !== null;
  const biddingOpen =
    connected &&
    auctionFees.fresh &&
    now > 0 &&
    now + live.clockOffsetMs < Date.parse(live.lot?.endsAt ?? lot.endsAt);
  const eligible = session.tokens && isBuyerEligible(session.tokens.user);
  const cardBidOpened = useRef(false);
  useEffect(() => {
    if (
      cardBidOpened.current ||
      !connected ||
      !eligible ||
      available === undefined ||
      !new URLSearchParams(window.location.search).has('bid')
    )
      return;
    cardBidOpened.current = true;
    const requested = new URLSearchParams(window.location.search).get(
      'amountKobo',
    );
    const entered =
      requested && /^[0-9]+$/.test(requested) ? Number(requested) : undefined;
    setAmount(
      entered !== undefined &&
        Number.isSafeInteger(entered) &&
        entered >= minimum
        ? entered
        : minimum,
    );
    if (entered !== undefined && entered < minimum)
      setMessage(
        'The price has changed. Review the updated minimum bid and fees before confirming.',
      );
    setInputVersion((value) => value + 1);
    setReview(true);
  }, [connected, eligible, available, minimum]);
  const shortfall =
    fee && available !== undefined && !live.lot?.isLeader
      ? Math.max(0, fee.totalKobo - available)
      : 0;
  const confirm = async () => {
    if (!biddingOpen && !operation.current) return;
    if (busy || !session.tokens || !amount || !fee || !connected || !eligible)
      return;
    setBusy(true);
    let domain: typeof import('../lib/bid-operation') | undefined;
    try {
      domain = await import('../lib/bid-operation');
      pendingPolicy.current ??= policy;
      operation.current ??= domain.createBidOperation(
        {
          prepare: async (id, input) =>
            (await currentClient()).prepare(id, input),
          confirm: async (id, input) =>
            (await currentClient()).confirm(id, input),
          cancel: async (id) => (await currentClient()).cancel(id),
        },
        lot.id,
        amount,
        mode,
        crypto.randomUUID(),
        fee.totalKobo,
        policy?.version,
      );
      const result = await operation.current.run();
      window.dispatchEvent(new Event('auction-ng-wallet-change'));
      setBalanceVersion((value) => value + 1);
      setMessage(
        result.isLeader
          ? `Your bid was accepted at ${formatNaira(result.currentPriceKobo)}. Check the live price for your current position.`
          : 'Bid accepted. Another buyer has a higher automatic limit. Check the live price before bidding again.',
      );
      setFeedback({
        tone: 'success',
        message: result.isLeader
          ? 'Bid accepted. You are leading at ' +
            formatNaira(result.currentPriceKobo) +
            '. Your position can change as others bid.'
          : 'Bid accepted. Another buyer still leads. Check the live price before bidding again.',
      });
      operation.current = null;
      pendingPolicy.current = undefined;
      setReview(false);
    } catch (error) {
      if (
        domain &&
        (error instanceof domain.BidFeeChangedError ||
          error instanceof domain.BidPreparationRejectedError)
      ) {
        operation.current = null;
        pendingPolicy.current = undefined;
        setReview(false);
        setMessage(error.message);
        setFeedback({ tone: 'error', message: error.message });
        setBalanceVersion((value) => value + 1);
      } else if (!domain) {
        const failure =
          'The bid form could not be loaded. Check your connection and try again.';
        setMessage(failure);
        setFeedback({ tone: 'error', message: failure });
      } else {
        const failure =
          'The bid result could not be confirmed. Retry this same bid to check its result. Do not place another bid while it is uncertain.';
        setMessage(failure);
        setFeedback({ tone: 'error', message: failure });
      }
    } finally {
      setBusy(false);
    }
  };
  async function currentClient() {
    const { createBidClient } = await import('@auction-ng/api-client/bids');
    const current = sessionRef.current;
    if (!current.tokens) throw new Error('Sign in again to check this bid.');
    return createBidClient(apiUrl, {
      accessToken: current.tokens.accessToken,
      deviceId: current.deviceId,
    });
  }
  if (!session.tokens)
    return (
      <LotAuctionPanel>
        {toolbar}
        <LotPriceSummary
          priceKobo={live.lot?.currentPriceKobo ?? lot.startPriceKobo}
          retailKobo={lot.retailPriceKobo}
          condition={lot.condition}
          endsAt={Date.parse(live.lot?.endsAt ?? lot.endsAt)}
          serverNow={now + live.clockOffsetMs}
          live={connected && now > 0}
        />
        <a
          className="agn-button agn-button--primary agn-detail-join"
          href={`/sign-up?${new URLSearchParams({ next: `/lots/${lot.id}?bid=1` })}`}
        >
          Join Now to Bid
        </a>
      </LotAuctionPanel>
    );
  return (
    <>
      <StickyBidBar>
        <div>
          {connected ? (
            <>
              <p>
                {!biddingOpen
                  ? 'Awaiting result'
                  : live.lot?.isLeader
                    ? 'You’re winning'
                    : live.lot?.currentPriceKobo === null
                      ? 'Current price'
                      : 'Current bid'}
              </p>
              <Price kobo={live.lot?.currentPriceKobo ?? lot.startPriceKobo} />
            </>
          ) : (
            <p>Reconnecting…</p>
          )}
        </div>
        <Button
          disabled={
            !biddingOpen ||
            !eligible ||
            available === undefined ||
            busy ||
            operation.current !== null
          }
          onClick={() => {
            bidEntry.current?.scrollIntoView({ block: 'center' });
            bidEntry.current?.querySelector<HTMLInputElement>('input')?.focus();
          }}
        >
          {biddingOpen ? 'Enter bid' : 'Bidding paused'}
        </Button>
      </StickyBidBar>
      <LotAuctionPanel>
        {toolbar}
        <BuyerStack>
          {auctionFees.error && !feeErrorDismissed && session.tokens && (
            <Toast tone="error" onClose={() => setFeeErrorDismissed(true)}>
              Auction fees could not be refreshed. Reconnect before placing a
              new bid.
            </Toast>
          )}
          <LotPriceSummary
            priceKobo={live.lot?.currentPriceKobo ?? lot.startPriceKobo}
            retailKobo={lot.retailPriceKobo}
            condition={lot.condition}
            endsAt={Date.parse(live.lot?.endsAt ?? lot.endsAt)}
            serverNow={now + live.clockOffsetMs}
            live={connected && now > 0}
          />
          {connected ? (
            <>
              {live.lot?.isLeader && (
                <WinningStatus>
                  {biddingOpen ? 'You’re winning' : 'Awaiting result'}
                </WinningStatus>
              )}
            </>
          ) : (
            <p role="status" className="agn-detail-bid-notice">
              {live.status === 'unavailable'
                ? 'Live bidding is unavailable. Try again later.'
                : 'Reconnecting… Live prices and bidding are paused.'}
            </p>
          )}
          {!eligible && (
            <p className="agn-detail-bid-notice agn-detail-bid-notice--strong">
              Only active buyer accounts with a verified email can bid. Sign in
              with your email code or contact support if your account is
              restricted.
            </p>
          )}
          <BiddingMethod
            value={mode}
            onChange={setMode}
            disabled={busy || operation.current !== null}
          />
          <p className="agn-detail-bid-notice">
            {mode === 'direct'
              ? 'Your full bid amount becomes the displayed price if you lead.'
              : 'We bid only as much as needed, up to your private limit. Your wallet reserves the full limit plus fees.'}
          </p>
          <p className="agn-detail-bid-minimum">
            <span>Minimum next bid:</span>
            <strong>
              {connected ? formatNaira(minimum) : 'Waiting for live price'}
            </strong>
          </p>
          <div className="agn-detail-bid-entry" ref={bidEntry}>
            <NairaInput
              key={inputVersion}
              initialValue={
                amount ? formatNaira(amount).slice(1).replaceAll(',', '') : ''
              }
              label={
                mode === 'direct'
                  ? 'Your bid amount'
                  : 'Your private spending limit'
              }
              onAmountChange={setAmount}
              disabled={busy || operation.current !== null}
              prefix="₦"
              decimalOnly
            />
            <Button
              disabled={
                !biddingOpen ||
                !eligible ||
                !amount ||
                operation.current !== null ||
                !fee ||
                amount < minimum ||
                busy ||
                shortfall > 0 ||
                available === undefined
              }
              onClick={() => {
                setMessage('');
                setShowFees(false);
                setReview(true);
              }}
            >
              <Gavel size={20} aria-hidden="true" />{' '}
              {mode === 'direct' ? 'Bid now' : 'Set limit'}
            </Button>
          </div>
          {fee && (
            <div className="agn-detail-fee-total">
              <div>
                <span>Estimated total including fees</span>
                <strong>{formatNaira(fee.totalKobo)}</strong>
              </div>
              <Button size="small" onClick={() => setShowFees(true)}>
                Fee details
              </Button>
            </div>
          )}
          <p className="agn-detail-bid-notice">
            Review the total and fees before confirming your bid.
          </p>
          {amount && !fee && (
            <p
              role="alert"
              className="agn-detail-bid-notice agn-detail-bid-notice--strong"
            >
              Enter a smaller amount. This total exceeds the supported limit.
            </p>
          )}
          {shortfall > 0 && (
            <p className="agn-detail-bid-notice agn-detail-bid-notice--strong">
              Your wallet needs another {formatNaira(shortfall)} to cover this
              bid and its fees.
            </p>
          )}
          {available === undefined && (
            <p
              role="status"
              className="agn-detail-bid-notice agn-detail-bid-notice--strong"
            >
              {balanceError
                ? 'Your wallet balance could not be checked. Retry before bidding.'
                : 'Checking your wallet balance…'}
            </p>
          )}
          {balanceError && (
            <Button onClick={() => setBalanceVersion((value) => value + 1)}>
              Retry wallet balance
            </Button>
          )}
          {shortfall > 0 && (
            <a className="agn-button agn-detail-wallet-action" href="/wallet">
              Check wallet or add funds
            </a>
          )}
          {showFees && fee && (
            <Suspense fallback={<p role="status">Opening fee details…</p>}>
              <FeeDetailsDialog
                fee={fee}
                rules={rules}
                direct={mode === 'direct'}
                onClose={() => setShowFees(false)}
              />
            </Suspense>
          )}
          {feedback && !review && (
            <Toast
              floating
              tone={feedback.tone}
              onClose={() => setFeedback(undefined)}
            >
              {feedback.message}
            </Toast>
          )}
          {operation.current && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(true)}
            >
              Check pending bid
            </Button>
          )}
          {review && (
            <Suspense fallback={<p role="status">Opening bid review…</p>}>
              <BidReviewDialog
                fee={fee}
                rules={rules}
                direct={mode === 'direct'}
                amount={amount ?? 0}
                message={message}
                messageTone={feedback?.tone}
                shortfall={shortfall}
                busy={busy}
                disabled={
                  !connected ||
                  (!biddingOpen && !operation.current) ||
                  shortfall > 0 ||
                  available === undefined
                }
                pendingOperation={operation.current}
                onClose={() => {
                  if (!busy) setReview(false);
                }}
                onConfirm={() => void confirm()}
                onBusyChange={setBusy}
                onMessageChange={(value, tone = 'error') => {
                  setMessage(value);
                  setFeedback(value ? { message: value, tone } : undefined);
                }}
                onCancelled={() => {
                  operation.current = null;
                  pendingPolicy.current = undefined;
                  setReview(false);
                  setBalanceVersion((value) => value + 1);
                }}
              />
            </Suspense>
          )}
        </BuyerStack>
      </LotAuctionPanel>
    </>
  );
}
export function LotDetail({
  lot,
  similar = [],
  serverTime,
}: {
  lot: Lot;
  similar?: CardLot[];
  serverTime?: string;
}) {
  const client = useBuyerRealtime();
  const outcome = useLotResult(lot.id);
  const closedState =
    outcome.result &&
    outcome.result.state !== 'open' &&
    outcome.result.state !== 'scheduled'
      ? outcome.result.state
      : lot.status === 'closed' || lot.status === 'closing'
        ? 'closing'
        : undefined;
  const auctionFees = useAuctionFees(lot.id);
  const [shareMessage, setShareMessage] = useState('');
  const toolbar = (
    <LotPanelHeader
      itemId={lot.lotNumber}
      actions={
        <>
          <LotWatch lotId={lot.id} iconOnly />
          <Button
            variant="secondary"
            className="agn-detail-icon-action"
            aria-label="Share lot"
            title="Share lot"
            onClick={() => {
              void (
                navigator.share
                  ? navigator.share({
                      title: lot.title,
                      url: window.location.href,
                    })
                  : navigator.clipboard.writeText(window.location.href)
              )
                .then(() => setShareMessage('Lot link ready to share.'))
                .catch(() =>
                  setShareMessage(
                    'Sharing was cancelled or unavailable. Copy the page address to share this lot.',
                  ),
                );
            }}
          >
            <Share2 size={18} aria-hidden="true" />
          </Button>
        </>
      }
    />
  );
  return (
    <BuyerPage title={lot.title} layout="lot">
      <Breadcrumbs
        items={[
          { label: 'Auctions', href: '/' },
          { label: lot.category.name, href: `/categories/${lot.category.id}` },
        ]}
      />
      <div className="agn-detail-columns">
        <div className="agn-detail-gallery-column">
          <ProductGallery images={lot.images} title={lot.title} />
        </div>
        <div className="agn-lot-detail-aside">
          {lot.status === 'scheduled' ? (
            <Suspense fallback={<p role="status">Loading pre-bid details…</p>}>
              <PreBidPanel
                lot={lot}
                toolbar={toolbar}
                quote={auctionFees.quote}
              />
            </Suspense>
          ) : closedState ? (
            <LotResultPanel
              state={closedState}
              price={outcome.result?.finalPriceKobo ?? null}
              error={outcome.error}
              onRetry={outcome.reload}
            >
              {toolbar}
            </LotResultPanel>
          ) : client ? (
            <BidPanel
              lot={lot}
              client={client}
              toolbar={toolbar}
              auctionFees={auctionFees}
            />
          ) : (
            <LotAuctionPanel>
              {toolbar}
              <LotPriceSummary
                priceKobo={lot.startPriceKobo}
                retailKobo={lot.retailPriceKobo}
                condition={lot.condition}
                endsAt={Date.parse(lot.endsAt)}
                serverNow={0}
                live={false}
              />
              <a
                className="agn-button agn-button--primary agn-detail-join"
                href={`/sign-up?${new URLSearchParams({ next: `/lots/${lot.id}?bid=1` })}`}
              >
                Join Now to Bid
              </a>
            </LotAuctionPanel>
          )}
          {lot.status !== 'scheduled' && lot.fixedPriceKobo !== null && (
            <InstantPurchase
              lotId={lot.id}
              priceKobo={lot.fixedPriceKobo}
              endsAt={lot.endsAt}
              compact
              auctionClosed={Boolean(closedState)}
            />
          )}
          <PickupLocationPanel
            name={lot.location.name}
            address={lot.location.address}
          />
          <LotInformationSection title="Description" open>
            <p>{lot.description}</p>
            <p>Retail estimate: {formatNaira(lot.retailPriceKobo)}.</p>
          </LotInformationSection>
          <Suspense fallback={<p role="status">Loading recorded bids...</p>}>
            <RecordedBids
              lotId={lot.id}
              demo={lot.lotNumber.startsWith('DEMO-')}
            />
          </Suspense>
          <LotInformationSection title="Condition" open>
            <ConditionBadge condition={lot.condition} />
            <p>
              Read the description and examine every photo for what is included,
              any wear and missing parts.{' '}
              {lot.lotNumber.startsWith('DEMO-')
                ? 'This is a demo condition grade, not an inspection of real inventory.'
                : 'Contact the warehouse if you need more information before bidding.'}
            </p>
          </LotInformationSection>
          <LotInformationSection title="Pickup and delivery">
            <p>
              Collect after payment with your private pickup pass. Confirm the
              warehouse hours before travelling. Partner delivery comes later.
            </p>
            <BuyerLink href="/locations">View pickup locations</BuyerLink>
          </LotInformationSection>
          <LotInformationSection title="Auction policies" open>
            <AuctionPolicies
              rules={
                auctionFees.quote
                  ? effectiveAuctionFeeRules(auctionFees.quote.policy)
                  : undefined
              }
              feesUnavailable={!auctionFees.fresh}
              startPriceKobo={lot.startPriceKobo}
              fixedPriceAvailable={lot.fixedPriceKobo !== null}
            />
          </LotInformationSection>
        </div>
      </div>
      {similar.length > 0 && (
        <section className="agn-section">
          <SectionHeading
            title="Similar items"
            href={`/categories/${lot.category.id}`}
          />
          <ClientCatalogueGrid lots={similar} rail serverTime={serverTime} />
        </section>
      )}
      {shareMessage && (
        <Toast onClose={() => setShareMessage('')}>{shareMessage}</Toast>
      )}
    </BuyerPage>
  );
}
