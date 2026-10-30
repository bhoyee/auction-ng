'use client';
import { useEffect, useRef, useState } from 'react';
import { buyerResourceIdSchema } from '@auction-ng/shared/buyer-schemas';
import { createPaymentClient } from '@auction-ng/api-client/payments';
import { createPurchaseClient } from '@auction-ng/api-client';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerStack, BuyerSkeleton } from '@auction-ng/ui/web/buyer';
import { Button } from '@auction-ng/ui/web/button';
import { Toast } from '@auction-ng/ui/web/toast';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import {
  PaymentStatusCard,
  PaymentReturnLink,
} from '@auction-ng/ui/web/payment-status';
import { apiUrl, useBuyer } from '../lib/session';

export function PaymentReturn() {
  const { tokens, deviceId } = useBuyer();
  const [result, setResult] = useState<{
    owner: string;
    status: string;
    kind: 'wallet' | 'wallet_transfer' | 'purchase';
    fundsCredited: boolean;
  }>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const lastNotification = useRef('');
  useEffect(() => {
    if (!tokens) return;
    let active = true;
    setResult(undefined);
    setError(false);
    const params = new URLSearchParams(window.location.search);
    const id = buyerResourceIdSchema.safeParse(params.get('id'));
    const kind = params.get('kind');
    if (
      !id.success ||
      (kind !== 'wallet' && kind !== 'wallet_transfer' && kind !== 'purchase')
    ) {
      setError(true);
      return;
    }
    const credentials = { accessToken: tokens.accessToken, deviceId };
    const request =
      kind === 'wallet_transfer'
        ? createPaymentClient(apiUrl, credentials).confirmTransfer(id.data)
        : kind === 'wallet'
          ? createPaymentClient(apiUrl, credentials).confirmCard(id.data)
          : createPurchaseClient(apiUrl, credentials).confirm(id.data);
    void request
      .then((value) => {
        if (!active) return;
        const fundsCredited = 'fundsCredited' in value && value.fundsCredited;
        setResult({
          owner: tokens.user.id,
          status: value.status,
          kind,
          fundsCredited,
        });
        if (
          lastNotification.current !==
          `${tokens.user.id}:${id.data}:${value.status}:${fundsCredited}`
        ) {
          lastNotification.current = `${tokens.user.id}:${id.data}:${value.status}:${fundsCredited}`;
          window.dispatchEvent(new Event('auction-ng-wallet-change'));
          window.dispatchEvent(new Event('auction-ng-notifications-change'));
        }
        if (kind !== 'purchase' && value.status !== 'pending') {
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
  const walletCreditOnly =
    current?.kind === 'purchase' && !success && current.fundsCredited;
  const noticeKey = error
    ? `error:${version}`
    : current
      ? `${current.owner}:${current.kind}:${current.status}:${current.fundsCredited}`
      : '';
  return (
    <BuyerPage narrow title="Payment status">
      <BuyerStack>
        {noticeKey && dismissed !== noticeKey && (
          <Toast
            floating
            tone={
              error
                ? 'error'
                : walletCreditOnly
                  ? 'info'
                  : success
                    ? 'success'
                    : current?.status === 'pending'
                      ? 'info'
                      : 'error'
            }
            onClose={() => setDismissed(noticeKey)}
          >
            {error
              ? 'We could not verify this payment. Retry verification; do not pay again.'
              : walletCreditOnly
                ? 'Payment received into your wallet. This reservation ended, so the item was not purchased.'
                : success
                  ? current?.kind === 'purchase'
                    ? 'Purchase successful. Your receipt and pickup details are ready.'
                    : 'Payment successful. Your wallet has been credited.'
                  : current?.status === 'pending'
                    ? 'Payment is still pending. We have not confirmed success; do not pay again.'
                    : 'This payment or reservation was not completed. Check your history and balance before trying again.'}
          </Toast>
        )}
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
          <PaymentStatusCard
            status={
              success
                ? 'confirmed'
                : current.status === 'pending'
                  ? 'pending'
                  : 'failed'
            }
            title={
              current.kind === 'purchase' && current.status === 'expired'
                ? 'Reservation expired'
                : current.kind === 'purchase' && current.status === 'cancelled'
                  ? 'Reservation cancelled'
                  : undefined
            }
          >
            <BuyerStack>
              <p role="status">
                {success
                  ? current.kind !== 'purchase'
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
          </PaymentStatusCard>
        )}
        <PaymentReturnLink
          href={
            current?.kind === 'purchase' && success
              ? '/purchase-history'
              : '/wallet'
          }
        >
          {current?.kind === 'purchase' && success
            ? 'View purchase history'
            : 'Back to wallet'}
        </PaymentReturnLink>
      </BuyerStack>
    </BuyerPage>
  );
}
