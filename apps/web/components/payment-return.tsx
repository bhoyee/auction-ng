'use client';
import { useEffect, useRef, useState } from 'react';
import { buyerResourceIdSchema } from '@auction-ng/shared/buyer-schemas';
import { createPaymentClient } from '@auction-ng/api-client/payments';
import { createPurchaseClient } from '@auction-ng/api-client';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import {
  BuyerLink,
  BuyerPanel,
  BuyerStack,
  BuyerSkeleton,
} from '@auction-ng/ui/web/buyer';
import { Button } from '@auction-ng/ui/web/button';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { Badge } from '@auction-ng/ui/web/auction';
import { apiUrl, useBuyer } from '../lib/session';

export function PaymentReturn() {
  const { tokens, deviceId } = useBuyer();
  const [result, setResult] = useState<{
    owner: string;
    status: string;
    kind: 'wallet' | 'purchase';
  }>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const lastNotification = useRef('');
  useEffect(() => {
    if (!tokens) return;
    let active = true;
    setResult(undefined);
    setError(false);
    const params = new URLSearchParams(window.location.search);
    const id = buyerResourceIdSchema.safeParse(params.get('id'));
    const kind = params.get('kind');
    if (!id.success || (kind !== 'wallet' && kind !== 'purchase')) {
      setError(true);
      return;
    }
    const credentials = { accessToken: tokens.accessToken, deviceId };
    const request =
      kind === 'wallet'
        ? createPaymentClient(apiUrl, credentials).confirmCard(id.data)
        : createPurchaseClient(apiUrl, credentials).confirm(id.data);
    void request
      .then((value) => {
        if (!active) return;
        setResult({ owner: tokens.user.id, status: value.status, kind });
        if (
          lastNotification.current !==
          `${tokens.user.id}:${id.data}:${value.status}`
        ) {
          lastNotification.current = `${tokens.user.id}:${id.data}:${value.status}`;
          window.dispatchEvent(new Event('auction-ng-wallet-change'));
        }
        if (kind === 'wallet' && value.status !== 'pending') {
          try {
            if (
              sessionStorage.getItem('auction-ng-pending-payment') === id.data
            )
              sessionStorage.removeItem('auction-ng-pending-payment');
          } catch {
            /* Verification does not depend on browser storage. */
          }
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [tokens, deviceId, version]);
  const current = result?.owner === tokens?.user.id ? result : undefined;
  const success = current?.status === 'credited' || current?.status === 'paid';
  return (
    <BuyerPage narrow title="Payment status">
      <BuyerStack>
        {error ? (
          <ErrorState
            title="We could not confirm this payment"
            onRetry={() => setVersion((value) => value + 1)}
          >
            Check your connection and retry verification. Do not pay again. You
            can also check your balance and payment history.
          </ErrorState>
        ) : !current ? (
          <>
            <p role="status">Confirming your payment securely…</p>
            <BuyerSkeleton />
          </>
        ) : (
          <BuyerPanel>
            <BuyerStack>
              <Badge tone={success ? 'win' : 'neutral'}>
                {success
                  ? 'Payment confirmed'
                  : current.status === 'pending'
                    ? 'Awaiting confirmation'
                    : 'Payment needs attention'}
              </Badge>
              <p role="status">
                {success
                  ? current.kind === 'wallet'
                    ? 'Your payment is verified and your wallet has been credited.'
                    : 'Your purchase is confirmed. Open Purchase history for your invoice and pickup details.'
                  : current.status === 'pending'
                    ? 'Your payment is still being checked. Do not pay again. Check its status shortly.'
                    : current.kind === 'purchase'
                      ? 'This reservation is no longer active. Any payment verified after expiry or cancellation is credited to your wallet instead. Check your balance and history.'
                      : 'This payment was not confirmed as successful. Check your funding history before trying another payment.'}
              </p>
              {!success && (
                <Button
                  variant="secondary"
                  onClick={() => setVersion((value) => value + 1)}
                >
                  Check payment again
                </Button>
              )}
            </BuyerStack>
          </BuyerPanel>
        )}
        <BuyerLink
          href={
            current?.kind === 'purchase' && success
              ? '/purchase-history'
              : '/wallet'
          }
        >
          {current?.kind === 'purchase' && success
            ? 'View purchase history'
            : 'Back to balance'}
        </BuyerLink>
      </BuyerStack>
    </BuyerPage>
  );
}
