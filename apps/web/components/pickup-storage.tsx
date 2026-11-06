'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPickupStorageClient } from '@auction-ng/api-client/pickup-storage';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  formatNaira,
  type StoragePayment,
  type StorageCase,
} from '@auction-ng/shared';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerLink } from '@auction-ng/ui/web/buyer';
import { PickupStorageItems } from '@auction-ng/ui/web/pickup-storage';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Select } from '@auction-ng/ui/web/select';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
import { WalletPagination } from '@auction-ng/ui/web/wallet-workspace';
import { apiUrl, useBuyer } from '../lib/session';
import { useWalletRead } from '../lib/wallet-read';
export function PickupStorage() {
  const session = useBuyer(),
    [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const read = useCallback(
    (c: { accessToken: string; deviceId: string }) =>
      createPickupStorageClient(apiUrl, c).mine({
        limit: 10,
        cursor: pages.at(-1),
      }),
    [pages],
  );
  const { data, error: refreshError, reload } = useWalletRead(read);
  const [selected, setSelected] = useState<StorageCase>(),
    [method, setMethod] = useState<StoragePayment['method']>('wallet'),
    [payment, setPayment] = useState<StoragePayment>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const attempt = useRef<
    | {
        caseId: string;
        method: string;
        quote: string;
        confirm: string;
      }
    | undefined
  >(undefined);
  const [returned, setReturned] = useState<string | null>(null);
  useEffect(() => {
    setReturned(new URLSearchParams(window.location.search).get('payment'));
  }, []);
  async function run<T>(
    action: (
      client: ReturnType<typeof createPickupStorageClient>,
    ) => Promise<T>,
  ): Promise<T> {
    if (!session.tokens) throw Error('Sign in again');
    const credentials = {
      accessToken: session.tokens.accessToken,
      deviceId: session.deviceId,
    };
    try {
      return await action(createPickupStorageClient(apiUrl, credentials));
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
      const renewed = await session.renewSession(credentials.accessToken);
      if (!renewed) throw cause;
      return action(
        createPickupStorageClient(apiUrl, {
          ...credentials,
          accessToken: renewed.accessToken,
        }),
      );
    }
  }
  useEffect(() => {
    if (!returned || !session.tokens) return;
    let active = true;
    async function verify() {
      try {
        const value = await run((c) => c.verify(returned ?? ''));
        if (active) {
          setPayment(value);
          setError('');
        }
      } catch {
        if (active)
          setError(
            'Payment confirmation is unavailable. Check again using the same payment; do not pay twice.',
          );
      }
    }
    void verify();
    const timer = setInterval(() => void verify(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // Session renewal is handled inside the owner-bound request.
  }, [returned, session.tokens?.accessToken]);
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
          caseId: selected.id,
          method,
          quote: crypto.randomUUID(),
          confirm: crypto.randomUUID(),
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
        'Storage checkout could not be prepared. A pending checkout may already exist; check its status before paying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!payment || !attempt.current || busy) return;
    setBusy(true);
    setError('');
    try {
      const value = await run((c) =>
        c.confirm({
          paymentId: payment.id,
          idempotencyKey: attempt.current?.confirm ?? '',
          consent: true,
        }),
      );
      setPayment(value);
      if (value.status === 'paid') {
        setMessage(
          'Storage payment confirmed. Your collection record is updated.',
        );
        reload();
      } else if (value.checkoutUrl) {
        const url = new URL(value.checkoutUrl);
        if (
          url.protocol !== 'https:' ||
          url.hostname !== 'checkout.paystack.com'
        )
          throw Error('Unsafe checkout');
        window.location.assign(url.href);
      } else
        setError(
          'Payment setup is awaiting confirmation. Check this same payment before trying again.',
        );
    } catch {
      setError(
        'Payment was not confirmed. Check available wallet funds or retry this same request. Do not make a second payment for an uncertain result.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <BuyerPage
      title="Pickup deadlines & storage"
      description="Check collection deadlines and settle outstanding storage before handover."
    >
      <BuyerLink href="/awaiting-pickup">Back to awaiting pickup</BuyerLink>
      {refreshError && (
        <StaffMessage>
          Pickup details could not be refreshed. Confirm current charges before
          paying.
        </StaffMessage>
      )}
      {message && <StaffMessage tone="success">{message}</StaffMessage>}
      {!data && !refreshError && <p role="status">Loading pickup details…</p>}
      {data && (
        <>
          <PickupStorageItems
            items={data.items}
            actions={(item) =>
              item.outstandingKobo > 0 && item.status !== 'collected' ? (
                <Button
                  onClick={() => {
                    setSelected(item);
                    setPayment(undefined);
                    setReturned(null);
                    setError('');
                    attempt.current = undefined;
                    if (item.id)
                      void run((c) => c.pendingPayment(item.id ?? ''))
                        .then((value) => {
                          if (value) {
                            setPayment(value);
                            setReturned(value.id);
                          }
                        })
                        .catch(() =>
                          setError(
                            'Pending checkouts could not be checked. Check your connection before paying.',
                          ),
                        );
                  }}
                >
                  Review storage payment
                </Button>
              ) : null
            }
          />
          {!data.items.length && <p>No pickup items on this page.</p>}
          <WalletPagination
            page={pages.length}
            size={10}
            hasNext={!!data.nextCursor}
            onPrevious={() =>
              setPages((p) => (p.length > 1 ? p.slice(0, -1) : p))
            }
            onNext={() => {
              if (data.nextCursor)
                setPages((p) => [...p, data.nextCursor ?? undefined]);
            }}
          />
        </>
      )}
      <Dialog
        open={!!selected || !!returned}
        onClose={() => {
          if (!busy) {
            setSelected(undefined);
            setReturned(null);
          }
        }}
        title="Storage payment"
      >
        {error && <StaffMessage>{error}</StaffMessage>}
        <div className="lv-storage-form">
          {selected && <strong>{selected.title}</strong>}
          {payment ? (
            <>
              <div className="lv-storage-summary">
                <div>
                  <span>Storage charge</span>
                  <strong>{formatNaira(payment.storageKobo)}</strong>
                </div>
                <div>
                  <span>Processing charge</span>
                  <strong>{formatNaira(payment.feeKobo)}</strong>
                </div>
                <div>
                  <span>Total to pay</span>
                  <strong>{formatNaira(payment.amountKobo)}</strong>
                </div>
              </div>
              {payment.status === 'paid' ? (
                <StaffMessage tone="success">
                  Payment confirmed. You can continue collection.
                </StaffMessage>
              ) : payment.status === 'review' ? (
                <StaffMessage tone="warning">
                  Payment received outside the valid checkout. Support must
                  review it; storage has not been marked paid. Do not pay again
                  before contacting support.
                </StaffMessage>
              ) : payment.status !== 'pending' ? (
                <StaffMessage>
                  This checkout is {payment.status}. Any later payment needs
                  support review.
                </StaffMessage>
              ) : (
                <>
                  <p>
                    Only confirm if you agree to pay this storage charge. Wallet
                    payment uses available funds; card or transfer pays storage
                    directly.
                  </p>
                  {!returned && (
                    <Button
                      variant="success"
                      busy={busy}
                      onClick={() => void confirm()}
                    >
                      Confirm payment {formatNaira(payment.amountKobo)}
                    </Button>
                  )}
                  {returned && payment.checkoutUrl && (
                    <Button
                      onClick={() => {
                        const url = new URL(payment.checkoutUrl ?? '');
                        if (
                          url.protocol === 'https:' &&
                          url.hostname === 'checkout.paystack.com'
                        )
                          window.location.assign(url.href);
                      }}
                    >
                      Continue hosted payment
                    </Button>
                  )}
                  <Button
                    busy={busy}
                    onClick={() => {
                      setBusy(true);
                      void run((c) => c.verify(payment.id))
                        .then(setPayment)
                        .catch(() =>
                          setError(
                            'Confirmation unavailable. Check again before paying.',
                          ),
                        )
                        .finally(() => {
                          setBusy(false);
                          reload();
                        });
                    }}
                  >
                    Check this payment
                  </Button>
                  <Button
                    variant="danger"
                    busy={busy}
                    onClick={() => {
                      setBusy(true);
                      void run((c) => c.cancel(payment.id))
                        .then((value) => {
                          setPayment(value);
                          attempt.current = undefined;
                        })
                        .catch(() =>
                          setError(
                            'Cancellation not confirmed. Check this payment again.',
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
                label="Payment method"
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as StoragePayment['method'])
                }
              >
                <option value="wallet">Available wallet balance</option>
                <option value="local_card">Nigerian card</option>
                <option value="international_card">International card</option>
                <option value="bank_transfer">One-time bank transfer</option>
              </Select>
              <p>
                No additional storage tax. Any processing charge is shown before
                confirmation.
              </p>
              <Button busy={busy} onClick={() => void quote()}>
                Show storage total
              </Button>
            </>
          )}
        </div>
      </Dialog>
    </BuyerPage>
  );
}
