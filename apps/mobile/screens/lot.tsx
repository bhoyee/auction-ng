import { ConditionBadge } from '../components/ui/condition-badge';
import {
  BidReviewSummary,
  bidReviewStyles,
} from '../components/ui/bid-review-summary';
import { usePreferences } from '../lib/preferences';
import { useEffect, useState } from 'react';
import { View, Pressable, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { Share2, CheckCircle2, CircleAlert, Clock3 } from 'lucide-react-native';
import {
  latestPurchaseStatus,
  purchaseFeedback,
  purchaseFailureMessage,
} from '../lib/purchase-feedback';
import { bidFailureMessage } from '../lib/bid-feedback';
import {
  createCatalogueClient,
  createBidClient,
  createWalletClient,
  createPurchaseClient,
} from '@auction-ng/api-client';
import { readAuctionFees } from '@auction-ng/api-client/auction-fees';
import { createPreBidClient } from '@auction-ng/api-client/prebids';
import { createSupportClient } from '@auction-ng/api-client/support';
import {
  databaseValues,
  calculateInvoiceLine,
  bidWalletShortfall,
  effectiveAuctionFeeRules,
  minNextBid,
  formatNaira,
  prepareBidSchema,
  preBidChangeSchema,
  purchaseInputSchema,
  type PurchaseStatus,
  type PurchaseInput,
} from '@auction-ng/shared';
import { parseNairaInput } from '@auction-ng/ui/presentation';
import { ApiError } from '@auction-ng/api-client/auth';
import { LotGallery } from '../components/ui/lot-gallery';
import { detailStyles as d } from '../components/ui/lot-detail-styles';
import { AuctionCountdown } from '../components/ui/auction-countdown';
import { Page, Notice, Loading, Pagination } from '../components/ui/page';
import { Body, Button, Input, Select, Dialog } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { bidHistoryStyles as bh } from '../components/ui/bid-history-styles';
import { colors } from '../components/ui/styles';
import { useSession } from '../lib/session';
import { useLiveRead } from '../lib/live-read';
import { useLiveLot } from '../lib/realtime';
import { useTick } from '../lib/clock';
import { useCommand } from '../lib/command';
import { useBuyerActivity } from '../lib/buyer-activity';
import { apiUrl } from '../lib/config';
import { photoUrl } from './catalogue';
import { purchaseReview } from '../lib/purchase-review';
export default function LotScreen() {
  const activity = useBuyerActivity();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, manager, online } = useSession();
  const { dataSaver } = usePreferences();
  const [allPhotos, setAllPhotos] = useState(false);
  const [bidFeedback, setBidFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  }>();
  const live = useLiveLot(id);
  const tick = useTick();
  const now = live.lot?.pausedAt ?? tick + live.clockOffsetMs;
  const [amount, setAmount] = useState(''),
    [mode, setMode] = useState<'direct' | 'automatic'>('direct'),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [image, setImage] = useState<string>(),
    [cursor, setCursor] = useState<string>(),
    [pages, setPages] = useState<(string | undefined)[]>([]),
    [reason, setReason] = useState(''),
    [cancelOpen, setCancelOpen] = useState(false),
    [feeConsent, setFeeConsent] = useState(false);
  const detail = useLiveRead(
    () => createCatalogueClient(apiUrl).detail(id),
    [id],
    5000,
  );
  const fees = useLiveRead(() => readAuctionFees(apiUrl, id), [id], 15000);
  const history = useLiveRead(
    () => createCatalogueClient(apiUrl).lotHistory(id, { limit: 10, cursor }),
    [id, cursor],
    5000,
  );
  const wallet = useLiveRead(
    () =>
      manager.run(async (c) => {
        try {
          return await createWalletClient(apiUrl, c).getBalance();
        } catch (error: unknown) {
          if (error instanceof ApiError && error.status === 404)
            return { availableKobo: 0 };
          throw error;
        }
      }),
    [session?.user.id],
    5000,
  );
  const pre = useLiveRead(
    () => manager.run((c) => createPreBidClient(apiUrl, c).read(id)),
    [id, session?.user.id],
    5000,
  );
  const cancellation = useLiveRead(
    () =>
      manager.run((c) => createSupportClient(apiUrl, c).bidCancellation(id)),
    [id, session?.user.id],
    5000,
  );
  const bid = useCommand('bid.' + id, prepareBidSchema),
    preCommand = useCommand('prebid.' + id, preBidChangeSchema);
  const lot = detail.data;
  const scheduled = lot?.status === 'scheduled';
  // Announced without a date (2026-11-14): view and watch only.
  const comingSoon = lot?.comingSoon === true;
  const price = live.lot?.currentPriceKobo ?? lot?.startPriceKobo ?? 0;
  const ends = Date.parse(live.lot?.endsAt ?? lot?.endsAt ?? '');
  const open = lot && ['open', 'closing'].includes(lot.status) && ends > now;
  const kobo = parseNairaInput(amount);
  const rules = fees.data
    ? effectiveAuctionFeeRules(fees.data.policy)
    : undefined;
  const invoice = kobo && rules ? calculateInvoiceLine(kobo, rules) : undefined;
  const existingReservation = scheduled
    ? pre.data?.preBid?.status === 'active'
      ? pre.data.preBid.totalKobo
      : 0
    : live.lot?.isLeader && cancellation.data?.commitment && rules
      ? calculateInvoiceLine(cancellation.data.commitment.maxKobo, rules)
          .totalKobo
      : 0;
  const fundingKnown =
    wallet.data !== undefined &&
    !wallet.error &&
    (scheduled
      ? pre.data !== undefined && !pre.error
      : !live.lot?.isLeader || (!!cancellation.data && !cancellation.error));
  const shortfall =
    invoice && wallet.data
      ? bidWalletShortfall(
          invoice.totalKobo,
          wallet.data.availableKobo,
          existingReservation,
        )
      : 0;
  const pending = scheduled ? preCommand.pending : bid.pending;
  const reviewed = pending
    ? calculateInvoiceLine(pending.maxKobo, rules)
    : invoice;
  async function place() {
    if (
      busy ||
      !lot ||
      !fees.data ||
      !reviewed ||
      !online ||
      (!scheduled &&
        (live.status !== 'live' || live.lot?.pausedAt !== undefined))
    ) {
      const text =
        'Your bid cannot be submitted yet. Reconnect and wait for the current price and fees to load, then retry.';
      setError(text);
      setBidFeedback({ tone: 'error', message: text });
      return;
    }
    setBusy(true);
    setError('');
    setBidFeedback(undefined);
    try {
      if (scheduled) {
        const input = await preCommand.begin({
          maxKobo: kobo ?? 0,
          feeVersion: fees.data.policy.version,
          expectedRevision: pre.data?.preBid?.revision ?? 0,
          idempotencyKey: Crypto.randomUUID(),
        });
        await manager.run((c) =>
          createPreBidClient(apiUrl, c).change(id, input),
        );
        await preCommand.complete();
        setMessage('Pre-bid saved. You can change or cancel it before launch.');
        setBidFeedback({
          tone: 'success',
          message: 'Pre-bid saved. You can change or cancel it before launch.',
        });
        pre.refresh();
      } else {
        const input = await bid.begin({
          maxKobo: kobo ?? 0,
          mode,
          feeVersion: fees.data.policy.version,
          idempotencyKey: Crypto.randomUUID(),
        });
        const prepared = await manager.run((c) =>
          createBidClient(apiUrl, c).prepare(id, input),
        );
        const result = await manager.run((c) =>
          createBidClient(apiUrl, c).confirm(id, {
            preparationId: prepared.preparationId,
            idempotencyKey: input.idempotencyKey,
          }),
        );
        await bid.complete();
        setMessage(
          result.isLeader
            ? 'Bid accepted. You are winning.'
            : 'Bid accepted, but another buyer is leading.',
        );
        setBidFeedback({
          tone: 'success',
          message: result.isLeader
            ? 'Your bid was accepted. You are currently winning.'
            : 'Your bid was accepted, but another buyer is leading.',
        });
      }
      setAmount('');
      wallet.refresh();
      activity.refresh();
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    } catch (failure) {
      const text = bidFailureMessage(failure);
      setError(text);
      setBidFeedback({ tone: 'error', message: text });
    } finally {
      setBusy(false);
    }
  }
  if (!lot)
    return (
      <Page title="Item details">
        <Notice message={detail.error} onClose={detail.refresh} />
        <Loading />
      </Page>
    );
  return (
    <Page title="Item details">
      <View style={n.between}>
        <Body tone="section" style={[n.grow, n.bold]}>
          {lot.title}
        </Body>
        <Pressable
          style={n.icon}
          accessibilityRole="button"
          accessibilityLabel="Share item"
          onPress={() =>
            void Share.share({
              message: `${lot.title} - lotvanta://lots/${id}`,
            })
          }
        >
          <Share2 color={colors['indigo-900']} />
        </Pressable>
      </View>
      <LotGallery
        key={`gallery:${lot.id}`}
        urls={(dataSaver && !allPhotos ? lot.images.slice(0, 1) : lot.images)
          .map((photo) => photoUrl(photo.url))
          .filter((url): url is string => !!url)}
        onEnlarge={setImage}
      />
      {dataSaver && !allPhotos && lot.images.length > 1 && (
        <Button variant="secondary" onPress={() => setAllPhotos(true)}>
          Load all item photos
        </Button>
      )}
      <Body tone="fine">Item ID: {lot.lotNumber}</Body>
      <Notice message={message} tone="success" onClose={() => setMessage('')} />
      <Notice message={error} onClose={() => setError('')} />
      <View style={n.surface}>
        <View style={d.priceRow}>
          <Body
            style={[n.price, d.priceValue]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {scheduled || comingSoon
              ? formatNaira(lot.startPriceKobo)
              : live.status === 'live'
                ? formatNaira(price)
                : 'Checking live price'}
          </Body>
          <View style={d.conditionSlot}>
            <ConditionBadge condition={lot.condition} />
          </View>
        </View>
        <Body tone="secondary" style={{ textDecorationLine: 'line-through' }}>
          {formatNaira(lot.retailPriceKobo)}
        </Body>
        {comingSoon ? (
          <View style={n.notice}>
            <Body style={n.bold}>Coming soon · date to be announced</Body>
            <Body>
              Watch this item and we’ll tell you as soon as bidding is
              scheduled. Pre-bids open then.
            </Body>
          </View>
        ) : (
          <AuctionCountdown
            large
            paused={live.lot?.pausedAt !== undefined}
            endsAt={scheduled ? Date.parse(lot.startsAt) : ends}
            serverNow={now}
            upcoming={scheduled}
            closed={!scheduled && !open}
            live={live.status === 'live'}
          />
        )}
        {live.lot?.pausedAt !== undefined && (
          <View style={n.warning}>
            <Body>
              Bidding is temporarily paused. Your remaining time and reserved
              bid funds are preserved.
            </Body>
          </View>
        )}
        {open && live.lot?.isLeader && (
          <View style={n.success}>
            <Body style={[n.white, n.bold]}>You are winning</Body>
          </View>
        )}
        {(open || scheduled) &&
          (!session ? (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [d.join, pressed && d.pressed]}
              onPress={() =>
                router.push({
                  pathname: '/sign-in',
                  params: { next: `/lots/${id}` },
                })
              }
            >
              <Body style={d.joinText}>Join now to bid</Body>
            </Pressable>
          ) : (
            <>
              <Select
                label="Bidding method"
                presentation="dropdown"
                value={mode}
                options={[
                  { value: 'direct', label: 'Bid full amount' },
                  { value: 'automatic', label: 'Automatic spending limit' },
                ]}
                onChange={(v) =>
                  setMode(v === 'automatic' ? 'automatic' : 'direct')
                }
              />
              <Notice
                compact
                message={
                  scheduled
                    ? 'Pre-bids are private limits. They activate when the auction launches, not an instant win.'
                    : mode === 'direct'
                      ? 'Your full amount becomes the price if you lead.'
                      : 'We bid only as much as needed, up to your private limit.'
                }
                tone="warning"
              />
              <Body tone="secondary" style={n.bold}>
                Minimum next bid:{' '}
                {formatNaira(
                  scheduled
                    ? lot.startPriceKobo
                    : minNextBid(
                        lot.startPriceKobo,
                        live.lot?.currentPriceKobo ?? null,
                      ),
                )}
              </Body>
              <Input
                label={
                  scheduled
                    ? 'Private pre-bid limit (NGN)'
                    : 'Your bid amount (NGN)'
                }
                keyboardType="decimal-pad"
                value={amount}
                editable={!pending && !busy}
                onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ''))}
              />
              {invoice && (
                <View style={n.shade}>
                  <Body style={n.bold}>
                    Estimated total: {formatNaira(invoice.totalKobo)}
                  </Body>
                </View>
              )}
              {wallet.error && (
                <Notice message="Your wallet balance could not be checked. Reconnect and wait for it to refresh before bidding." />
              )}
              {!wallet.data && !wallet.error && (
                <Body tone="fine">Checking available wallet balance…</Body>
              )}
              <Button
                fullWidth
                variant="success"
                disabled={
                  !online ||
                  live.lot?.pausedAt !== undefined ||
                  (!scheduled && (!open || live.status !== 'live')) ||
                  (!pending && (!kobo || !fees.data)) ||
                  (!pending && (!fundingKnown || shortfall > 0)) ||
                  cancellation.data?.blocked
                }
                onPress={() => {
                  setBidFeedback(undefined);
                  setError('');
                  setReview(true);
                }}
              >
                {pending
                  ? 'Retry saved request'
                  : scheduled
                    ? 'Preview pre-bid'
                    : 'Bid now'}
              </Button>
              {fundingKnown && shortfall > 0 && !pending && (
                <View style={n.warning}>
                  <Body>
                    Your available wallet needs {formatNaira(shortfall)} more.
                  </Body>
                  <Button onPress={() => router.push('/wallet')}>
                    Top up wallet
                  </Button>
                </View>
              )}
              {scheduled && pre.data?.preBid?.status === 'active' && (
                <>
                  <Body>
                    Your private pre-bid: {formatNaira(pre.data.preBid.maxKobo)}
                  </Body>
                  <Button
                    variant="danger"
                    onPress={() => {
                      const current = pre.data?.preBid;
                      if (!current) return;
                      void manager
                        .run((c) =>
                          createPreBidClient(apiUrl, c).cancel(id, {
                            expectedRevision: current.revision,
                            idempotencyKey: Crypto.randomUUID(),
                          }),
                        )
                        .then(() => {
                          setMessage('Pre-bid cancelled. Funds released.');
                          pre.refresh();
                          wallet.refresh();
                        })
                        .catch(() =>
                          setError(
                            'Cancellation could not be confirmed. Refresh and retry.',
                          ),
                        );
                    }}
                  >
                    Cancel pre-bid free
                  </Button>
                </>
              )}
              {!scheduled &&
                live.lot?.isLeader &&
                cancellation.data?.canRequest && (
                  <>
                    <Body tone="secondary">
                      Accepted bids cannot be cancelled. Reserved funds are
                      released when you are outbid.
                    </Body>
                    <Button
                      variant="danger"
                      onPress={() => setCancelOpen(true)}
                    >
                      Request bid cancellation
                    </Button>
                  </>
                )}
              {cancellation.data?.blocked && (
                <Notice
                  message="Staff completed your cancellation. You cannot bid on this item again."
                  tone="warning"
                />
              )}
            </>
          ))}
      </View>
      {lot.fixedPriceKobo ? (
        <PurchasePanel
          key={`purchase:${id}`}
          lotId={id}
          price={lot.fixedPriceKobo}
          available={
            !!lot.fixedPriceKobo &&
            !!open &&
            live.status === 'live' &&
            live.lot?.pausedAt === undefined
          }
        />
      ) : null}
      <View style={n.surface}>
        <Body tone="section">Pickup location</Body>
        <Body style={n.bold}>{lot.location.name}</Body>
        <Body tone="secondary">
          {lot.location.address ?? 'See collection instructions after payment.'}
        </Body>
      </View>
      <View style={n.surface}>
        <Body tone="section">Description</Body>
        <Body style={d.copy}>{lot.description}</Body>
      </View>
      <View style={[n.surface, d.history]}>
        <View style={bh.heading}>
          <Clock3 size={20} color={colors['indigo-900']} />
          <Body style={bh.title}>Bid history</Body>
        </View>
        <Notice message={history.error} onClose={history.refresh} />
        {!history.data && !history.error && <Loading />}
        <View style={bh.columns}>
          <Body tone="fine" style={n.bold}>
            Bidder / Date (WAT)
          </Body>
          <Body tone="fine" style={n.bold}>
            Bid amount
          </Body>
        </View>
        {history.data?.items.map((row) => (
          <View key={row.id} style={n.historyRow}>
            <View style={n.historyMeta}>
              <Body tone="fine" style={n.bold}>
                {row.bidderLabel}
              </Body>
              <Body tone="fine" style={bh.muted}>
                {new Date(row.createdAt).toLocaleString('en-NG', {
                  timeZone: 'Africa/Lagos',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Body>
            </View>
            <Body
              style={n.historyAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {formatNaira(row.currentPriceKobo)}
            </Body>
          </View>
        ))}
        {history.data?.items.length === 0 && (
          <Body style={d.copy}>No bids recorded yet.</Body>
        )}
        <Pagination
          previous={
            pages.length
              ? () => {
                  setCursor(pages.at(-1));
                  setPages((p) => p.slice(0, -1));
                }
              : undefined
          }
          next={
            history.data?.nextCursor
              ? () => {
                  setPages((p) => [...p, cursor]);
                  setCursor(history.data?.nextCursor ?? undefined);
                }
              : undefined
          }
        />
      </View>
      <View style={n.surface}>
        <Body tone="section">Condition and auction policies</Body>
        {lot.pickupStorage && (
          <Body style={d.copy}>
            Collect within five centre working days after your ready notice.
            Your deadline appears in your account and invoice. Late storage is{' '}
            {formatNaira(lot.pickupStorage.dailyKobo)} per working day per item,
            capped at {formatNaira(lot.pickupStorage.capKobo)}. Pay explicitly
            at collection using wallet, card or one-time transfer; processing
            charges are shown separately. Your wallet is never automatically
            charged.
          </Body>
        )}
        <View style={d.badges}>
          {databaseValues.lotConditions.map((grade) => (
            <ConditionBadge key={grade} condition={grade} />
          ))}
        </View>
        <Body style={d.copy}>
          {lot.condition.replaceAll('_', ' ')}. Read the description and inspect
          all photos before bidding. Check and test your item at the collection
          centre before taking it away. No returns after collection.
        </Body>
        <Body style={d.copy}>
          Fees are shown before you commit. Your invoice and pickup pass become
          available after successful payment.
        </Body>
      </View>
      <Dialog
        open={review}
        title={
          bidFeedback?.tone === 'success'
            ? 'Bid confirmed'
            : bidFeedback?.tone === 'error'
              ? 'Bid not confirmed'
              : pending
                ? 'Review saved bid'
                : 'Review your bid'
        }
        onClose={() => {
          if (!busy) setReview(false);
        }}
        presentation="sheet"
        footer={
          <View style={bidReviewStyles.footer}>
            {bidFeedback?.tone === 'success' ? (
              <Button
                fullWidth
                variant="success"
                onPress={() => {
                  setReview(false);
                  setBidFeedback(undefined);
                }}
              >
                Done
              </Button>
            ) : (
              <>
                <Notice message={error} />
                <Button
                  fullWidth
                  variant="success"
                  busy={busy}
                  disabled={
                    !online ||
                    (!scheduled &&
                      (live.status !== 'live' ||
                        live.lot?.pausedAt !== undefined)) ||
                    (!pending && (!fundingKnown || shortfall > 0))
                  }
                  onPress={() => void place()}
                >
                  {pending
                    ? 'Retry saved request'
                    : scheduled
                      ? 'Confirm pre-bid'
                      : 'Confirm bid'}
                </Button>
              </>
            )}
            {bidFeedback?.tone !== 'success' && (
              <Button
                fullWidth
                variant="secondary"
                disabled={busy}
                onPress={() => setReview(false)}
              >
                {pending ? 'Back to item' : 'Edit bid'}
              </Button>
            )}
          </View>
        }
      >
        {bidFeedback?.tone === 'success' ? (
          <View style={bidReviewStyles.result} accessibilityLiveRegion="polite">
            <CheckCircle2 size={48} color={colors.surface} />
            <Body tone="section" style={bidReviewStyles.resultText}>
              {scheduled ? 'Pre-bid saved' : 'Bid accepted'}
            </Body>
            <Body style={bidReviewStyles.resultText}>
              {bidFeedback.message}
            </Body>
          </View>
        ) : (
          reviewed &&
          rules && (
            <BidReviewSummary
              title={lot.title}
              thumbnail={photoUrl(lot.thumbnail?.thumbnailUrl)}
              automatic={
                scheduled ||
                (pending && 'mode' in pending
                  ? pending.mode === 'automatic'
                  : mode === 'automatic')
              }
              scheduled={!!scheduled}
              invoice={reviewed}
              rules={rules}
            />
          )
        )}
      </Dialog>
      <Dialog
        open={!!image}
        title="Item photo"
        onClose={() => setImage(undefined)}
      >
        {image && (
          <Image
            source={photoUrl(image)}
            style={{ width: '100%', height: 400 }}
            contentFit="contain"
          />
        )}
      </Dialog>
      <Dialog
        open={cancelOpen && !!live.lot?.isLeader}
        title="Request bid cancellation"
        onClose={() => setCancelOpen(false)}
        presentation="sheet"
      >
        <View style={n.content}>
          <Body>
            Requesting review is free. If support approves and completes
            cancellation, the fee is {(cancellation.data?.feeBps ?? 0) / 100}%
            of the public price at approval.
          </Body>
          <Input
            label="Reason"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <Button
            variant={feeConsent ? 'primary' : 'secondary'}
            onPress={() => setFeeConsent((v) => !v)}
          >
            {feeConsent
              ? 'Fee terms accepted'
              : 'Accept cancellation fee terms'}
          </Button>
          <Button
            disabled={!feeConsent || reason.trim().length < 10 || busy}
            onPress={() => {
              setBusy(true);
              const input = {
                reason,
                acknowledged: true as const,
                feeAcknowledged: true as const,
                idempotencyKey: Crypto.randomUUID(),
              };
              void manager
                .run((c) =>
                  createSupportClient(apiUrl, c).requestBidCancellation(
                    id,
                    input,
                  ),
                )
                .then(() => {
                  setMessage(
                    'Request sent to our support team. Your bid remains active.',
                  );
                  setCancelOpen(false);
                  cancellation.refresh();
                })
                .catch(() =>
                  setError(
                    'Request could not be confirmed. Check Customer Service before retrying.',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Send request to support
          </Button>
        </View>
      </Dialog>
    </Page>
  );
}
function PurchasePanel({
  lotId,
  price,
  available,
}: {
  lotId: string;
  price: number;
  available: boolean;
}) {
  const activity = useBuyerActivity();
  const { session, manager, online } = useSession();
  const router = useRouter();
  const [method, setMethod] = useState<PurchaseInput['method']>('wallet'),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<PurchaseStatus>();
  const command = useCommand('purchase.' + lotId, purchaseInputSchema);
  const reviewed = purchaseReview(price, method, command.pending);
  const outcome = useLiveRead(
    () => {
      if (!result) throw Error('No checkout');
      return manager.run((c) => createPurchaseClient(apiUrl, c).get(result.id));
    },
    [result?.id],
    5000,
  );
  const current = latestPurchaseStatus(result, outcome.data);
  const feedback = current ? purchaseFeedback(current) : undefined;
  useEffect(() => {
    if (current && current.status !== 'pending') {
      void command.complete();
      activity.refresh();
    }
  }, [current?.status]);
  async function purchase() {
    if (busy || (!available && !command.pending)) return;
    setBusy(true);
    setError('');
    try {
      const input = await command.begin({
        idempotencyKey: Crypto.randomUUID(),
        method: reviewed.method,
        acceptedPriceKobo: reviewed.price,
        acceptedTaxKobo: reviewed.tax,
        acceptedProcessingFeeKobo: reviewed.processing,
        acceptedTotalKobo: reviewed.total,
      });
      const saved = await manager.run((c) =>
        createPurchaseClient(apiUrl, c).start(lotId, input),
      );
      setResult(saved);
      if (saved.authorizationUrl) {
        const url = new URL(saved.authorizationUrl);
        if (
          url.protocol !== 'https:' ||
          !['checkout.paystack.com'].includes(url.hostname)
        )
          throw Error('Invalid checkout address');
        await WebBrowser.openBrowserAsync(url.href);
        outcome.refresh();
      }
    } catch (failure) {
      setError(purchaseFailureMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={available ? [n.surface, n.shade] : undefined}>
      {available && (
        <>
          <Body tone="section" style={n.bold}>
            Instant win {formatNaira(price)}
          </Body>
          <Body tone="secondary">
            Buy now without waiting for the auction to finish.
          </Body>
          <Button
            variant="success"
            onPress={() =>
              session
                ? setOpen(true)
                : router.push({
                    pathname: '/sign-in',
                    params: { next: `/lots/${lotId}` },
                  })
            }
          >
            Buy Now
          </Button>
        </>
      )}
      <Dialog
        open={open}
        title={
          feedback?.title ??
          (error ? 'Purchase not confirmed' : 'Review Buy Now')
        }
        presentation="sheet"
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        footer={
          current && feedback ? (
            <View style={bidReviewStyles.footer}>
              {current.status === 'paid' && (
                <Button
                  fullWidth
                  variant="success"
                  onPress={() => {
                    setOpen(false);
                    router.push('/orders');
                  }}
                >
                  View order
                </Button>
              )}
              <Button
                fullWidth
                variant="secondary"
                onPress={() => setOpen(false)}
              >
                Done
              </Button>
            </View>
          ) : undefined
        }
      >
        <View style={n.content}>
          {current && feedback ? (
            <>
              <View
                style={[
                  bidReviewStyles.result,
                  feedback.tone === 'error'
                    ? n.danger
                    : feedback.tone === 'warning'
                      ? n.warning
                      : n.success,
                ]}
                accessibilityLiveRegion="polite"
              >
                {feedback.tone === 'success' ? (
                  <CheckCircle2 size={48} color={colors.surface} />
                ) : feedback.tone === 'warning' ? (
                  <Clock3 size={48} color={colors.ink} />
                ) : (
                  <CircleAlert size={48} color={colors.surface} />
                )}
                <Body
                  tone="section"
                  style={
                    feedback.tone === 'warning'
                      ? n.bold
                      : bidReviewStyles.resultText
                  }
                >
                  {feedback.title}
                </Body>
                <Body
                  style={
                    feedback.tone === 'warning'
                      ? undefined
                      : bidReviewStyles.resultText
                  }
                >
                  {feedback.message}
                </Body>
                {current.status === 'paid' && (
                  <Body tone="section" style={bidReviewStyles.resultText}>
                    {formatNaira(current.amountKobo)}
                  </Body>
                )}
              </View>
            </>
          ) : error ? (
            <View
              style={[bidReviewStyles.result, n.danger]}
              accessibilityLiveRegion="polite"
            >
              <CircleAlert size={48} color={colors.surface} />
              <Body tone="section" style={bidReviewStyles.resultText}>
                Purchase not confirmed
              </Body>
              <Body style={bidReviewStyles.resultText}>{error}</Body>
            </View>
          ) : (
            <>
              {command.pending ? (
                <Body style={n.bold}>
                  Saved payment method: {reviewed.method.replaceAll('_', ' ')}
                </Body>
              ) : (
                <Select
                  label="Pay with"
                  value={method}
                  onChange={(value) =>
                    setMethod(value as PurchaseInput['method'])
                  }
                  options={[
                    { value: 'wallet', label: 'Wallet balance' },
                    { value: 'local_card', label: 'Nigerian card' },
                    {
                      value: 'international_card',
                      label: 'International card',
                    },
                    { value: 'bank_transfer', label: 'One-time bank transfer' },
                  ]}
                />
              )}
              <Body>Item: {formatNaira(reviewed.price)}</Body>
              <Body>Tax (7.5%): {formatNaira(reviewed.tax)}</Body>
              <Body>
                Processing charges: {formatNaira(reviewed.processing)}
              </Body>
              <Body tone="section">Total: {formatNaira(reviewed.total)}</Body>
              <Body tone="secondary">
                Reservation lasts up to ten minutes, capped at the auction
                deadline. Late verified payments go to your wallet.
              </Body>
            </>
          )}
          {current && <Notice message={error} />}
          {current ? (
            <>
              {current.status === 'pending' && (
                <>
                  <Button
                    onPress={() => {
                      void manager
                        .run((c) =>
                          createPurchaseClient(apiUrl, c).confirm(current.id),
                        )
                        .then(setResult)
                        .catch(() =>
                          setError('Could not check payment. Retry.'),
                        );
                    }}
                  >
                    Check payment status
                  </Button>
                  {current.status === 'pending' && (
                    <Button
                      variant="danger"
                      onPress={() =>
                        void manager
                          .run((c) =>
                            createPurchaseClient(apiUrl, c).cancel(current.id),
                          )
                          .then(setResult)
                          .catch(() =>
                            setError(
                              'The cancellation could not be confirmed. Check this reservation status before retrying.',
                            ),
                          )
                      }
                    >
                      Cancel reservation
                    </Button>
                  )}
                </>
              )}
            </>
          ) : (
            <Button
              busy={busy}
              disabled={!online || (!available && !command.pending)}
              onPress={() => void purchase()}
              variant="success"
            >
              {command.pending ? 'Retry same purchase' : 'Confirm purchase'}
            </Button>
          )}
        </View>
      </Dialog>
    </View>
  );
}
