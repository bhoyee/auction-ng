import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { createPickupStorageClient } from '@auction-ng/api-client/pickup-storage';
import {
  formatNaira,
  type StorageCase,
  type StoragePayment,
} from '@auction-ng/shared';
import {
  Page,
  Private,
  Notice,
  Pagination,
  Loading,
} from '../components/ui/page';
import { Body, Button, Dialog, Select } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { useLiveRead } from '../lib/live-read';
import { useSession } from '../lib/session';
import { apiUrl } from '../lib/config';
export default function PickupStorageScreen() {
  const { manager, session } = useSession();
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const read = useLiveRead(
    () =>
      manager.run((c) =>
        createPickupStorageClient(apiUrl, c).mine({
          limit: 10,
          cursor: pages.at(-1),
        }),
      ),
    [pages, session?.user.id],
    5000,
  );
  const [selected, setSelected] = useState<StorageCase>(),
    [payment, setPayment] = useState<StoragePayment>(),
    [method, setMethod] = useState<StoragePayment['method']>('wallet'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const attempt = useRef<
    | { quote: string; confirm: string; method: string; caseId: string }
    | undefined
  >(undefined);
  const run = <T,>(
    action: (
      client: ReturnType<typeof createPickupStorageClient>,
    ) => Promise<T>,
  ) => manager.run((c) => action(createPickupStorageClient(apiUrl, c)));
  const statusRead = useLiveRead(
    () => run((c) => c.verify(payment?.id ?? '')),
    [payment?.id, session?.user.id],
    15000,
    !!payment && payment.status === 'pending' && payment.method !== 'wallet',
  );
  useEffect(() => {
    if (
      statusRead.data &&
      statusRead.data.id === payment?.id &&
      statusRead.data.status !== 'pending'
    ) {
      setPayment(statusRead.data);
      setError('');
      read.refresh();
    }
  }, [statusRead.data, payment?.id, read.refresh]);
  async function open(item: StorageCase) {
    attempt.current = undefined;
    setSelected(item);
    setError('');
    setPayment(undefined);
    if (!item.id) return;
    try {
      const pending = await run((c) => c.pendingPayment(item.id ?? ''));
      if (pending) setPayment(pending);
    } catch {
      setError(
        'Pending storage payments could not be checked. Check your connection before paying.',
      );
    }
  }
  async function quote() {
    if (!selected?.id || busy) return;
    setBusy(true);
    setError('');
    try {
      if (
        !attempt.current ||
        attempt.current.caseId !== selected.id ||
        attempt.current.method !== method
      )
        attempt.current = {
          quote: Crypto.randomUUID(),
          confirm: Crypto.randomUUID(),
          method,
          caseId: selected.id,
        };
      const current = attempt.current;
      setPayment(
        await run((c) =>
          c.quote({
            caseId: current.caseId,
            method,
            idempotencyKey: current.quote,
          }),
        ),
      );
    } catch {
      setError(
        'Storage total could not be confirmed. Reopen this item to check pending payments before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!payment || busy) return;
    setBusy(true);
    setError('');
    try {
      if (!attempt.current)
        throw Error('Resume checkout from its payment link');
      const key = attempt.current.confirm;
      const value = await run((c) =>
        c.confirm({
          paymentId: payment.id,
          idempotencyKey: key,
          consent: true,
        }),
      );
      setPayment(value);
      if (value.checkoutUrl && value.status === 'pending') {
        const url = new URL(value.checkoutUrl);
        if (
          url.protocol !== 'https:' ||
          url.hostname !== 'checkout.paystack.com'
        )
          throw Error('Invalid checkout');
        await WebBrowser.openBrowserAsync(url.href);
        setPayment(await run((c) => c.verify(value.id)));
      }
      read.refresh();
    } catch {
      setError(
        'Payment was not confirmed. Check this same payment before paying again. Confirm available wallet funds if using wallet.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Pickup deadlines">
      <Private>
        <Notice message={read.error} onClose={read.refresh} />
        {!read.data && !read.error && <Loading />}
        {read.data?.items.map((item) => (
          <View key={item.invoiceLineId} style={n.surface}>
            <Body style={n.bold}>{item.title}</Body>
            <Body tone="fine">
              {item.reference} · {item.invoiceNumber}
            </Body>
            <Body tone="secondary">{item.status.replaceAll('_', ' ')}</Body>
            <Body style={n.bold}>
              {item.dueAt
                ? new Date(item.dueAt).toLocaleString('en-NG', {
                    timeZone: 'Africa/Lagos',
                  }) + ' WAT'
                : 'Collection window not started'}
            </Body>
            {item.id && (
              <Body tone="fine">
                {item.waived
                  ? 'Storage waived'
                  : `${formatNaira(item.dailyKobo)} / working day · ${formatNaira(item.capKobo)} cap`}
              </Body>
            )}
            <Body style={n.historyAmount}>
              {formatNaira(item.outstandingKobo)} storage outstanding
            </Body>
            {item.outstandingKobo > 0 && item.status !== 'collected' && (
              <Button onPress={() => void open(item)}>
                Review storage payment
              </Button>
            )}
          </View>
        ))}
        {read.data && !read.data.items.length && (
          <Body>No pickup items on this page.</Body>
        )}
        <Pagination
          previous={
            pages.length > 1 ? () => setPages((p) => p.slice(0, -1)) : undefined
          }
          next={
            read.data?.nextCursor
              ? () =>
                  setPages((p) => [...p, read.data?.nextCursor ?? undefined])
              : undefined
          }
        />
        <Dialog
          open={!!selected}
          onClose={() => {
            if (!busy) setSelected(undefined);
          }}
          title="Storage payment"
        >
          <Notice message={error} onClose={() => setError('')} />
          {selected && <Body style={n.bold}>{selected.title}</Body>}
          {payment ? (
            <>
              <View style={n.surface}>
                <Body>Storage: {formatNaira(payment.storageKobo)}</Body>
                <Body>Processing charge: {formatNaira(payment.feeKobo)}</Body>
                <Body style={n.bold}>
                  Total: {formatNaira(payment.amountKobo)}
                </Body>
              </View>
              {payment.status === 'paid' ? (
                <Notice
                  tone="success"
                  message="Storage payment confirmed. Continue collection at the centre."
                />
              ) : payment.status === 'review' ? (
                <Notice
                  tone="warning"
                  message="Payment needs support review. Storage is not marked paid; contact support before paying again."
                />
              ) : payment.status !== 'pending' ? (
                <Body>This checkout is {payment.status}.</Body>
              ) : (
                <>
                  <Body tone="secondary">
                    Confirm to pay storage using your chosen method. Your wallet
                    is never automatically charged.
                  </Body>
                  {attempt.current && (
                    <Button
                      variant="success"
                      busy={busy}
                      onPress={() => void confirm()}
                    >
                      Confirm payment
                    </Button>
                  )}
                  {payment.checkoutUrl && (
                    <Button
                      busy={busy}
                      onPress={() => {
                        if (payment.checkoutUrl)
                          void WebBrowser.openBrowserAsync(payment.checkoutUrl);
                      }}
                    >
                      Continue hosted payment
                    </Button>
                  )}
                  <Button
                    busy={busy}
                    onPress={() => {
                      setBusy(true);
                      void run((c) => c.verify(payment.id))
                        .then((value) => {
                          setPayment(value);
                          read.refresh();
                        })
                        .catch(() =>
                          setError(
                            'Payment could not be confirmed. Check again before paying.',
                          ),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    Check this payment
                  </Button>
                  <Button
                    variant="danger"
                    busy={busy}
                    onPress={() => {
                      setBusy(true);
                      void run((c) => c.cancel(payment.id))
                        .then((value) => {
                          setPayment(value);
                          attempt.current = undefined;
                        })
                        .catch(() =>
                          setError(
                            'Cancellation not confirmed. Check this payment.',
                          ),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    Cancel checkout
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              <Select
                label="Pay storage with"
                value={method}
                onChange={(v) => setMethod(v as StoragePayment['method'])}
                options={[
                  { value: 'wallet', label: 'Available wallet balance' },
                  { value: 'local_card', label: 'Nigerian card' },
                  { value: 'international_card', label: 'International card' },
                  { value: 'bank_transfer', label: 'One-time transfer' },
                ]}
              />
              <Body tone="secondary">
                Processing charges are shown before confirmation. No additional
                storage tax.
              </Body>
              <Button busy={busy} onPress={() => void quote()}>
                Show storage total
              </Button>
            </>
          )}
        </Dialog>
      </Private>
    </Page>
  );
}
