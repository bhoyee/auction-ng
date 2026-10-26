'use client';
import { useEffect, useState, useSyncExternalStore, useRef } from 'react';
import { calculateInvoiceLine } from '@auction-ng/shared/fees';
import { cancelBidResultSchema } from '@auction-ng/shared/bid-schemas';
import type { CatalogueDetail } from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import {
  minNextBid,
  type BidMode,
  DEFAULT_BID_MODE,
} from '@auction-ng/shared/auction-rules';
import { createBidClient } from '@auction-ng/api-client/bids';
import { createWalletClient } from '@auction-ng/api-client/wallet';
import { createUseLiveLot } from '@auction-ng/api-client/realtime-hook';
import type { RealtimeClient } from '@auction-ng/api-client/realtime';
import {
  Badge,
  Button,
  BuyerColumns,
  BuyerLink,
  BuyerPage,
  BuyerPanel,
  BuyerRow,
  BuyerStack,
  Countdown,
  Dialog,
  MoneyLine,
  NairaInput,
  Price,
  ProductPhoto,
  Select,
  StickyBidBar,
} from '@auction-ng/ui/web';
import { apiUrl, useBuyer } from '../lib/session';
import { useBuyerRealtime } from './catalogue-grid';
import {
  BidFeeChangedError,
  BidPreparationRejectedError,
  createBidOperation,
} from '../lib/bid-operation';
import { useOnline } from '../lib/network';
import { RecordedBids } from './recorded-bids';
const useLiveLot = createUseLiveLot({ useEffect, useSyncExternalStore });
type Lot = CatalogueDetail;
function BidPanel({ lot, client }: { lot: Lot; client: RealtimeClient }) {
  const session = useBuyer();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const online = useOnline();
  const live = useLiveLot(client, lot.id);
  const [now, setNow] = useState(0);
  const [amount, setAmount] = useState<number>();
  const [mode, setMode] = useState<BidMode>(DEFAULT_BID_MODE);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [available, setAvailable] = useState<number>();
  const [balanceVersion, setBalanceVersion] = useState(0);
  const [inputVersion, setInputVersion] = useState(0);
  const operation = useRef<ReturnType<
    typeof createBidOperation<
      Awaited<ReturnType<ReturnType<typeof createBidClient>['confirm']>>
    >
  > | null>(null);
  useEffect(() => {
    let active = true;
    setAvailable(undefined);
    if (session.tokens)
      void createWalletClient(apiUrl, {
        accessToken: session.tokens.accessToken,
        deviceId: session.deviceId,
      })
        .openWallet()
        .then((value) => {
          if (active) setAvailable(value.availableKobo);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [session.tokens, session.deviceId, balanceVersion]);
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
    if (amount && Number.isSafeInteger(amount))
      fee = calculateInvoiceLine(amount);
  } catch {
    /* Reject totals outside safe integer kobo. */
  }
  const connected = online && live.status === 'live' && live.lot !== null;
  const biddingOpen =
    connected &&
    now > 0 &&
    now + live.clockOffsetMs < Date.parse(live.lot?.endsAt ?? lot.endsAt);
  const suggestions: number[] = [];
  let suggestedPrice = live.lot?.currentPriceKobo ?? null;
  for (let index = 0; index < 3; index++) {
    try {
      const next = minNextBid(lot.startPriceKobo, suggestedPrice);
      suggestions.push(next);
      suggestedPrice = next;
    } catch {
      break;
    }
  }
  const eligible =
    session.tokens?.user.phoneVerified &&
    session.tokens.user.role === 'buyer' &&
    session.tokens.user.status === 'active';
  const shortfall =
    fee && available !== undefined && !live.lot?.isLeader
      ? Math.max(0, fee.totalKobo - available)
      : 0;
  const confirm = async () => {
    if (!biddingOpen && !operation.current) return;
    if (busy || !session.tokens || !amount || !fee || !connected || !eligible)
      return;
    setBusy(true);
    try {
      operation.current ??= createBidOperation(
        {
          prepare: (id, input) => currentClient().prepare(id, input),
          confirm: (id, input) => currentClient().confirm(id, input),
          cancel: (id) => currentClient().cancel(id),
        },
        lot.id,
        amount,
        mode,
        crypto.randomUUID(),
        fee.totalKobo,
      );
      const result = await operation.current.run();
      window.dispatchEvent(new Event('auction-ng-wallet-change'));
      setBalanceVersion((value) => value + 1);
      setMessage(
        result.isLeader
          ? `Your bid was accepted at ${formatNaira(result.currentPriceKobo)}. Check the live price for your current position.`
          : 'Bid accepted. Another buyer has a higher automatic limit. Check the live price before bidding again.',
      );
      operation.current = null;
      setReview(false);
    } catch (error) {
      if (
        error instanceof BidFeeChangedError ||
        error instanceof BidPreparationRejectedError
      ) {
        operation.current = null;
        setReview(false);
        setMessage(error.message);
        setBalanceVersion((value) => value + 1);
      } else
        setMessage(
          'The bid result could not be confirmed. Retry this same bid to check its result. Do not place another bid while it is uncertain.',
        );
    } finally {
      setBusy(false);
    }
  };
  function currentClient() {
    const current = sessionRef.current;
    if (!current.tokens) throw new Error('Sign in again to check this bid.');
    return createBidClient(apiUrl, {
      accessToken: current.tokens.accessToken,
      deviceId: current.deviceId,
    });
  }
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
                      ? 'Starting bid'
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
            setAmount(minimum);
            setInputVersion((value) => value + 1);
            setReview(true);
          }}
        >
          {biddingOpen ? `Bid ${formatNaira(minimum)}` : 'Bidding paused'}
        </Button>
      </StickyBidBar>
      <BuyerPanel>
        <BuyerStack>
          {connected ? (
            <>
              <p>
                {live.lot?.currentPriceKobo === null
                  ? 'Starting bid'
                  : 'Current bid'}
              </p>
              <Price
                kobo={live.lot?.currentPriceKobo ?? lot.startPriceKobo}
                label={
                  live.lot?.currentPriceKobo === null
                    ? 'Starting bid'
                    : 'Current price'
                }
              />
              <Countdown
                endsAt={Date.parse(live.lot?.endsAt ?? lot.endsAt)}
                serverNow={now + live.clockOffsetMs}
              />
              {live.lot?.isLeader && (
                <Badge tone="win">
                  {biddingOpen ? 'You’re winning' : 'Awaiting result'}
                </Badge>
              )}
            </>
          ) : (
            <p role="status">
              {live.status === 'unavailable'
                ? 'Live bidding is unavailable. Try again later.'
                : 'Reconnecting… Live prices and bidding are paused.'}
            </p>
          )}
          {!eligible && (
            <p className="agn-buyer-message">
              Your account needs a verified phone before bidding. Email sign-in
              alone does not verify your phone.
            </p>
          )}
          <p>
            Minimum next bid:{' '}
            {connected ? formatNaira(minimum) : 'Waiting for live price'}
          </p>
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
          />
          {connected && (
            <BuyerRow>
              {suggestions.map((value) => (
                <Button
                  key={value}
                  variant="secondary"
                  disabled={
                    !biddingOpen ||
                    operation.current !== null ||
                    !eligible ||
                    busy ||
                    available === undefined
                  }
                  onClick={() => {
                    setAmount(value);
                    setInputVersion((version) => version + 1);
                    setReview(true);
                  }}
                >
                  {mode === 'direct' ? 'Bid' : 'Set limit'} {formatNaira(value)}
                </Button>
              ))}
            </BuyerRow>
          )}
          <Select
            label="Bidding method"
            value={mode}
            disabled={busy || operation.current !== null}
            onChange={(event) =>
              setMode(
                event.target.value === 'automatic' ? 'automatic' : 'direct',
              )
            }
          >
            <option value="direct">Bid the full amount</option>
            <option value="automatic">Set an automatic spending limit</option>
          </Select>
          <p>
            {mode === 'direct'
              ? 'If this bid wins, your full bid amount becomes the displayed price.'
              : 'We bid only as much as needed, up to your private limit. Your wallet reserves the full limit plus fees.'}
          </p>
          {fee && (
            <MoneyLine
              label="Estimated total including fees"
              value={formatNaira(fee.totalKobo)}
              total
            />
          )}
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
              setReview(true);
            }}
          >
            Review {mode === 'direct' ? 'bid' : 'automatic limit'}
          </Button>
          {amount && !fee && (
            <p role="alert">
              Enter a smaller amount. This total exceeds the supported limit.
            </p>
          )}
          {shortfall > 0 && (
            <p className="agn-buyer-message">
              Your wallet needs another {formatNaira(shortfall)} to cover this
              bid and its fees.
            </p>
          )}
          <BuyerLink href="/wallet">Check wallet or add funds</BuyerLink>
          {message && <p role="status">{message}</p>}
          {operation.current && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(true)}
            >
              Check pending bid
            </Button>
          )}
          <Dialog
            open={review}
            onClose={() => {
              if (!busy) setReview(false);
            }}
            title="Confirm your bid"
            presentation="sheet"
          >
            <BuyerStack>
              {fee && (
                <>
                  <MoneyLine
                    label={
                      mode === 'direct' ? 'Bid amount' : 'Maximum hammer price'
                    }
                    value={formatNaira(fee.hammerKobo)}
                  />
                  <MoneyLine
                    label="Buyer premium"
                    value={formatNaira(fee.premiumKobo)}
                  />
                  <MoneyLine
                    label="Lot fee"
                    value={formatNaira(fee.lotFeeKobo)}
                  />
                  <MoneyLine
                    label="VAT on fees"
                    value={formatNaira(fee.vatKobo)}
                  />
                  <MoneyLine
                    label="Total reserved from your wallet"
                    value={formatNaira(fee.totalKobo)}
                    total
                  />
                </>
              )}
              <p>
                Being outbid releases your reservation. Winning charges the
                final total. Late bids may extend this auction.
              </p>
              {message && <p role="status">{message}</p>}
              {shortfall > 0 && (
                <p>
                  Your wallet needs another {formatNaira(shortfall)}.{' '}
                  <BuyerLink href="/wallet">Add funds</BuyerLink>
                </p>
              )}
              <Button
                busy={busy}
                disabled={
                  !connected ||
                  (!biddingOpen && !operation.current) ||
                  shortfall > 0 ||
                  available === undefined
                }
                onClick={() => void confirm()}
              >
                {operation.current
                  ? 'Retry this bid'
                  : `Place bid ${formatNaira(amount ?? 0)}`}
              </Button>
              {operation.current && (
                <Button
                  variant="secondary"
                  busy={busy}
                  onClick={() => {
                    if (!operation.current || busy) return;
                    setBusy(true);
                    void operation.current
                      .cancel()
                      .then((value) => {
                        const result = cancelBidResultSchema.parse(value);
                        if (result.status === 'ready') {
                          setMessage(
                            'This bid is still being checked. Retry its result shortly.',
                          );
                          return;
                        }
                        setMessage(
                          result.status === 'accepted'
                            ? 'This bid was accepted. Check your current live position.'
                            : 'This bid is no longer pending. Check your wallet and live price before bidding again.',
                        );
                        operation.current = null;
                        setReview(false);
                        setBalanceVersion((value) => value + 1);
                      })
                      .catch(() =>
                        setMessage(
                          'The bid could not be checked. Reconnect and retry this same operation.',
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Check or cancel pending bid
                </Button>
              )}
            </BuyerStack>
          </Dialog>
        </BuyerStack>
      </BuyerPanel>
    </>
  );
}
export function LotDetail({ lot }: { lot: Lot }) {
  const client = useBuyerRealtime();
  const [selected, setSelected] = useState(0);
  return (
    <BuyerPage
      title={lot.title}
      description={`${lot.lotNumber} · Pickup at ${lot.location.name}`}
    >
      <BuyerColumns>
        <BuyerStack>
          <ProductPhoto src={lot.images[selected]?.url} alt={lot.title} />
          <BuyerRow>
            {lot.images.map((image, index) => (
              <Button
                key={image.id}
                variant="secondary"
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
              >
                Photo {index + 1}
              </Button>
            ))}
          </BuyerRow>
          <BuyerPanel>
            <h2>About this lot</h2>
            <Badge>
              {lot.condition.charAt(0).toUpperCase() +
                lot.condition.slice(1).replaceAll('_', ' ')}
            </Badge>
            <p>{lot.description}</p>
            <p>
              Retail reference: {formatNaira(lot.retailPriceKobo)}. Inspect the
              condition and photos before bidding.
            </p>
            <h2>Pickup</h2>
            <p>
              {lot.location.name}. Collect after payment using your private
              pickup pass. Delivery is not yet available.
            </p>
            <BuyerLink href="/locations">View pickup locations</BuyerLink>
          </BuyerPanel>
          <RecordedBids lotId={lot.id} />
        </BuyerStack>
        {client ? (
          <BidPanel lot={lot} client={client} />
        ) : (
          <BuyerPanel>
            <BuyerStack>
              <p>Starting bid</p>
              <Price kobo={lot.startPriceKobo} />
              <p>Sign in to see live prices and place a bid.</p>
              <BuyerLink href="/sign-in">Sign in to bid</BuyerLink>
            </BuyerStack>
          </BuyerPanel>
        )}
      </BuyerColumns>
    </BuyerPage>
  );
}
