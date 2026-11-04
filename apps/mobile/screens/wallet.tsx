import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import {
  createWalletClient,
  createPaymentClient,
} from '@auction-ng/api-client';
import { createWalletControlsClient } from '@auction-ng/api-client/wallet-controls';
import {
  formatNaira,
  cardFundingInputSchema,
  transferFundingInputSchema,
  type CardFundingInput,
} from '@auction-ng/shared';
import { parseNairaInput } from '@auction-ng/ui/presentation';
import {
  Page,
  Private,
  Notice,
  Loading,
  Pagination,
} from '../components/ui/page';
import {
  Body,
  Button,
  Input,
  Select,
  Tabs,
  Dialog,
} from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { useSession } from '../lib/session';
import { useLiveRead } from '../lib/live-read';
import { useCommand } from '../lib/command';
import { apiUrl } from '../lib/config';
type Quote = {
  amountKobo: number;
  feeKobo: number;
  creditKobo: number;
  feePolicy: string;
};
export default function WalletScreen() {
  const { manager, session, online } = useSession();
  const router = useRouter();
  const [amount, setAmount] = useState(''),
    [method, setMethod] = useState('local_card'),
    [quote, setQuote] = useState<Quote>(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [tab, setTab] = useState('Funding history'),
    [cursor, setCursor] = useState<string>(),
    [history, setHistory] = useState<(string | undefined)[]>([]);
  const balance = useLiveRead(
    () => manager.run((c) => createWalletClient(apiUrl, c).getBalance()),
    [session?.user.id],
    5000,
  );
  const controls = useLiveRead(
    () => manager.run((c) => createWalletControlsClient(apiUrl, c).get()),
    [session?.user.id],
    5000,
  );
  const funding = useLiveRead(
    () =>
      manager.run((c) =>
        createPaymentClient(apiUrl, c).getHistory({ limit: 10, cursor }),
      ),
    [cursor, session?.user.id],
    5000,
  );
  const activity = useLiveRead(
    () =>
      manager.run((c) =>
        createWalletClient(apiUrl, c).getHistory({ limit: 10, cursor }),
      ),
    [cursor, session?.user.id],
    5000,
  );
  const card = useCommand('fund.card', cardFundingInputSchema),
    transfer = useCommand('fund.transfer', transferFundingInputSchema);
  const pending = method === 'bank_transfer' ? transfer.pending : card.pending;
  async function showFees() {
    const kobo = parseNairaInput(amount);
    if (!kobo || !online) return;
    setBusy(true);
    setError('');
    try {
      const value = await manager.run<Quote>((c) =>
        method === 'bank_transfer'
          ? createPaymentClient(apiUrl, c).quoteTransfer(kobo)
          : createPaymentClient(apiUrl, c).quoteCard(
              kobo,
              method === 'international_card' ? 'international' : 'local',
            ),
      );
      setQuote(value);
      setOpen(true);
    } catch {
      setError('Fees could not be loaded. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  }
  async function fund() {
    if (busy || !quote) return;
    setBusy(true);
    setError('');
    try {
      let checkout: { authorizationUrl: string; paymentId: string };
      if (method === 'bank_transfer') {
        const input = await transfer.begin({
          amountKobo: quote.amountKobo,
          feePolicy: 'paystack-transfer-v1',
          acceptedFeeKobo: quote.feeKobo,
          acceptedCreditKobo: quote.creditKobo,
          consent: true,
          idempotencyKey: Crypto.randomUUID(),
        });
        checkout = await manager.run((c) =>
          createPaymentClient(apiUrl, c).initializeTransfer(input),
        );
        await transfer.complete();
      } else {
        const input = await card.begin({
          amountKobo: quote.amountKobo,
          cardType: method === 'international_card' ? 'international' : 'local',
          feePolicy: quote.feePolicy as CardFundingInput['feePolicy'],
          acceptedFeeKobo: quote.feeKobo,
          acceptedCreditKobo: quote.creditKobo,
          consent: true,
          idempotencyKey: Crypto.randomUUID(),
        });
        checkout = await manager.run((c) =>
          createPaymentClient(apiUrl, c).initializeCard(input),
        );
        await card.complete();
      }
      const url = new URL(checkout.authorizationUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com')
        throw Error('Invalid checkout address');
      setOpen(false);
      await WebBrowser.openBrowserAsync(url.href);
      const status = await manager.run((c) =>
        method === 'bank_transfer'
          ? createPaymentClient(apiUrl, c).confirmTransfer(checkout.paymentId)
          : createPaymentClient(apiUrl, c).confirmCard(checkout.paymentId),
      );
      setNotice(
        status.status === 'credited'
          ? 'Payment confirmed. Your wallet is funded.'
          : 'Payment ' +
              status.status +
              '. Funding history will update automatically.',
      );
      funding.refresh();
      balance.refresh();
    } catch {
      setError(
        'Checkout could not be confirmed. Retry the saved request or check Funding history.',
      );
    } finally {
      setBusy(false);
    }
  }
  const page = tab === 'Funding history' ? funding.data : activity.data;
  return (
    <Page title="Your wallet" back={false}>
      <Private>
        <Notice
          message={error || balance.error}
          onClose={() => {
            setError('');
            balance.refresh();
          }}
        />
        <Notice message={notice} tone="success" onClose={() => setNotice('')} />
        <View style={[n.surface, n.shade]}>
          <View style={n.between}>
            <Body tone="secondary">Available balance</Body>
            <Button
              size="small"
              disabled={!controls.data?.withdrawalsEnabled}
              onPress={() => router.push('/withdraw')}
            >
              Withdraw
            </Button>
          </View>
          <Body style={n.price}>
            {balance.data
              ? formatNaira(balance.data.availableKobo)
              : 'Checking balance'}
          </Body>
          <View style={n.warning}>
            <Body tone="secondary" style={n.bold}>
              Reserved for bids:{' '}
              {balance.data ? formatNaira(balance.data.heldKobo) : 'Checking'}
            </Body>
          </View>
          <Body tone="fine">
            Total wallet:{' '}
            {balance.data ? formatNaira(balance.data.totalKobo) : 'Checking'}
          </Body>
        </View>
        <View style={n.surface}>
          <Body tone="section">Add funds</Body>
          {!controls.data?.depositsEnabled && (
            <Notice
              tone="warning"
              message={
                controls.error
                  ? 'Deposit availability could not be checked. Retry before paying.'
                  : 'New deposits are paused.'
              }
            />
          )}
          <Input
            label="Amount to fund (NGN)"
            value={amount}
            onChangeText={(text) => {
              setAmount(text.replace(/[^0-9.]/g, ''));
              setQuote(undefined);
            }}
            keyboardType="decimal-pad"
          />
          <Select
            label="Payment method"
            value={method}
            onChange={(value) => {
              setMethod(value);
              setQuote(undefined);
            }}
            options={[
              { value: 'local_card', label: 'Nigerian card' },
              { value: 'international_card', label: 'International card' },
              { value: 'bank_transfer', label: 'One-time bank transfer' },
            ]}
          />
          <Button
            busy={busy}
            disabled={!online || !controls.data?.depositsEnabled}
            onPress={() => void showFees()}
          >
            Show fee and wallet credit
          </Button>
          {pending && (
            <Button
              onPress={() => {
                setQuote({
                  amountKobo: pending.amountKobo,
                  feeKobo: pending.acceptedFeeKobo,
                  creditKobo: pending.acceptedCreditKobo,
                  feePolicy: pending.feePolicy,
                });
                setOpen(true);
              }}
            >
              Review saved funding request
            </Button>
          )}
        </View>
        <Body tone="section">Transactions</Body>
        <Tabs
          label="Wallet transactions"
          items={['Funding history', 'Wallet activity'].map((value) => ({
            label: value,
            value,
            panel: null,
          }))}
          value={tab}
          onChange={(value) => {
            setTab(value);
            setCursor(undefined);
            setHistory([]);
          }}
        />
        <Notice
          message={tab === 'Funding history' ? funding.error : activity.error}
          onClose={() => {
            funding.refresh();
            activity.refresh();
          }}
        />
        {!page && !error && <Loading />}
        {tab === 'Funding history'
          ? funding.data?.items.map((item) => (
              <View key={item.id} style={n.surface}>
                <View style={n.between}>
                  <Body style={n.bold}>{formatNaira(item.creditKobo)}</Body>
                  <View style={n.badge}>
                    <Body tone="fine">{item.status}</Body>
                  </View>
                </View>
                <Body tone="secondary">
                  {item.fundingMethod.replaceAll('_', ' ')} -{' '}
                  {new Date(item.createdAt).toLocaleDateString('en-NG')}
                </Body>
                <Body tone="fine">
                  Paid {formatNaira(item.transferKobo)}; processing fee{' '}
                  {formatNaira(item.feeKobo)}
                </Body>
                {item.status === 'pending' && (
                  <View style={n.row}>
                    <Button
                      size="small"
                      onPress={() => {
                        void manager
                          .run((c) =>
                            item.fundingMethod === 'checkout_transfer'
                              ? createPaymentClient(apiUrl, c).confirmTransfer(
                                  item.id,
                                )
                              : createPaymentClient(apiUrl, c).confirmCard(
                                  item.id,
                                ),
                          )
                          .then(() => {
                            funding.refresh();
                            balance.refresh();
                          })
                          .catch(() =>
                            setError(
                              'Payment status could not be checked. Retry.',
                            ),
                          );
                      }}
                    >
                      Check status
                    </Button>
                    <Button
                      size="small"
                      variant="danger"
                      onPress={() =>
                        void manager
                          .run((c) =>
                            createPaymentClient(apiUrl, c).cancelCheckout(
                              item.id,
                            ),
                          )
                          .then(() => funding.refresh())
                          .catch(() =>
                            setError('Could not close checkout. Retry.'),
                          )
                      }
                    >
                      Cancel checkout
                    </Button>
                  </View>
                )}
              </View>
            ))
          : activity.data?.items.map((item) => (
              <View key={item.id} style={n.surface}>
                <View style={n.between}>
                  <Body tone="secondary">
                    {item.purpose === 'bid_cancellation'
                      ? 'Bid cancellation fee'
                      : item.operation.replaceAll('_', ' ')}
                  </Body>
                  <Body style={n.bold}>{formatNaira(item.amountKobo)}</Body>
                </View>
                <Body tone="fine">
                  {new Date(item.createdAt).toLocaleString('en-NG', {
                    timeZone: 'Africa/Lagos',
                  })}{' '}
                  WAT
                </Body>
              </View>
            ))}
        {page?.items.length === 0 && <Body>No transactions yet.</Body>}
        <Pagination
          previous={
            history.length
              ? () => {
                  setCursor(history.at(-1));
                  setHistory((h) => h.slice(0, -1));
                }
              : undefined
          }
          next={
            page?.nextCursor
              ? () => {
                  setHistory((h) => [...h, cursor]);
                  setCursor(page.nextCursor ?? undefined);
                }
              : undefined
          }
        />
        <Dialog
          open={open}
          title="Review wallet funding"
          presentation="sheet"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <View style={n.content}>
            <Notice message={error} />
            <Body>
              Amount to fund:{' '}
              {formatNaira(pending?.amountKobo ?? quote?.amountKobo ?? 0)}
            </Body>
            <Body>
              Processing fee:{' '}
              {formatNaira(pending?.acceptedFeeKobo ?? quote?.feeKobo ?? 0)}
            </Body>
            <Body tone="section">
              Wallet credit:{' '}
              {formatNaira(
                pending?.acceptedCreditKobo ?? quote?.creditKobo ?? 0,
              )}
            </Body>
            <Button busy={busy} onPress={() => void fund()}>
              {pending ? 'Retry same checkout' : 'Continue to secure payment'}
            </Button>
          </View>
        </Dialog>
      </Private>
    </Page>
  );
}
