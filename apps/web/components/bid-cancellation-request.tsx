'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createSupportClient } from '@auction-ng/api-client/support';
import { ApiError } from '@auction-ng/api-client/auth';
import { LIVE_BID_COMMITMENT_NOTICE } from '@auction-ng/shared/support-schemas';
import { formatNaira } from '@auction-ng/shared/money';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Toast } from '@auction-ng/ui/web/toast';
import { BuyerStack } from '@auction-ng/ui/web/buyer';
import { apiUrl, useBuyer } from '../lib/session';
import { ActionVerificationDialog } from './action-verification-dialog';
import { useBuyerRealtime } from '../lib/buyer-realtime';
const subscribeIdle = () => () => {};
type State = Awaited<
  ReturnType<ReturnType<typeof createSupportClient>['bidCancellation']>
>;
type Input = Parameters<
  ReturnType<typeof createSupportClient>['requestBidCancellation']
>[1];
const statusLabel = (status: string) =>
  status === 'open'
    ? 'Awaiting staff review'
    : status === 'in_progress'
      ? 'Staff reviewing'
      : 'Support conversation resolved';
export function BidCancellationRequest({
  lotId,
  compact = false,
  onBlockedChange,
}: {
  lotId: string;
  compact?: boolean;
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const { tokens } = useBuyer();
  return tokens ? (
    <SignedInBidCancellationRequest
      key={tokens.user.id + ':' + lotId}
      lotId={lotId}
      compact={compact}
      onBlockedChange={onBlockedChange}
    />
  ) : null;
}
function SignedInBidCancellationRequest({
  lotId,
  compact,
  onBlockedChange,
}: {
  lotId: string;
  compact: boolean;
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const { tokens, deviceId, renewSession } = useBuyer();
  const realtime = useBuyerRealtime();
  const live = useSyncExternalStore(
    realtime?.subscribe ?? subscribeIdle,
    () => realtime?.getSnapshot(lotId) ?? null,
    () => null,
  );
  const leading = live?.status === 'live' && live.lot?.isLeader === true;
  useEffect(() => realtime?.watchLot(lotId), [realtime, lotId]);
  const [state, setState] = useState<State>();
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [version, setVersion] = useState(0),
    [verifying, setVerifying] = useState(false);
  const pending = useRef<Input | undefined>(undefined);
  useEffect(() => {
    if (!leading) {
      setOpen(false);
      setSuccess('');
    }
  }, [leading]);
  const owner = tokens?.user.id;
  const client = () =>
    tokens
      ? createSupportClient(
          apiUrl,
          { accessToken: tokens.accessToken, deviceId },
          false,
          async (failed) => {
            const fresh = await renewSession(failed);
            return fresh && fresh.user.id === owner
              ? { accessToken: fresh.accessToken, deviceId }
              : null;
          },
        )
      : null;
  useEffect(() => {
    setOpen(false);
    setReason('');
    setAck(false);
    pending.current = undefined;
    setError('');
    setSuccess('');
  }, [owner, lotId]);
  useEffect(() => {
    let active = true,
      running = false;
    setState(undefined);
    if (!tokens) return;
    const api = createSupportClient(
      apiUrl,
      { accessToken: tokens.accessToken, deviceId },
      false,
      async (failed) => {
        const fresh = await renewSession(failed);
        return fresh && fresh.user.id === owner
          ? { accessToken: fresh.accessToken, deviceId }
          : null;
      },
    );
    const read = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const result = await api.bidCancellation(lotId);
        if (active) {
          setState(result);
          onBlockedChange?.(result.blocked);
          if (result.blocked) {
            setOpen(false);
            setSuccess('');
            pending.current = undefined;
          }
          setError((current) =>
            current ===
            'The bid review status could not be refreshed. Retry to check it.'
              ? ''
              : current,
          );
        }
      } catch {
        if (active)
          setError(
            'The bid review status could not be refreshed. Retry to check it.',
          );
      } finally {
        running = false;
      }
    };
    void read();
    // Refresh private eligibility from the API; public socket updates are triggers only.
    let streamId = realtime?.getSnapshot(lotId).lot?.streamId;
    const unsubscribe = realtime?.subscribe(() => {
      const next = realtime.getSnapshot(lotId).lot?.streamId;
      if (next && next !== streamId) {
        streamId = next;
        void read();
      }
    });
    const timer = setInterval(() => void read(), 5000);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    window.addEventListener('auction-ng-wallet-change', read);
    return () => {
      active = false;
      unsubscribe?.();
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
      window.removeEventListener('auction-ng-wallet-change', read);
    };
  }, [
    tokens?.accessToken,
    deviceId,
    lotId,
    owner,
    renewSession,
    version,
    compact,
    onBlockedChange,
    realtime,
  ]);
  if (state?.blocked || !leading) return null;
  if (!tokens || (!state?.commitment && !state?.conversation && !error))
    return null;
  if (
    state &&
    !state.canRequest &&
    !state.conversation &&
    !pending.current &&
    !error
  )
    return null;
  // Every new request needs a fresh single-use security check.
  const verified = (verificationId: string) => {
    setVerifying(false);
    pending.current = pending.current
      ? { ...pending.current, verificationId }
      : {
          reason: reason.trim(),
          acknowledged: true,
          feeAcknowledged: true,
          idempotencyKey: crypto.randomUUID(),
          verificationId,
        };
    void submit();
  };
  const submit = async () => {
    const api = client();
    if (busy || !api) return;
    if (!pending.current) {
      setError('');
      setVerifying(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.requestBidCancellation(lotId, pending.current);
      setState(result);
      pending.current = undefined;
      setOpen(false);
      setSuccess(
        'Request sent to our support team. Your bid and reserved funds remain active.',
      );
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.code === 'VERIFICATION_REQUIRED'
      ) {
        setVerifying(true);
      } else if (
        failure instanceof ApiError &&
        [400, 403, 409, 429].includes(failure.status)
      ) {
        pending.current = undefined;
        setError(
          failure.status === 429
            ? 'Too many requests. Wait a moment and retry.'
            : 'Request not sent. Check that the auction is still live, then retry or contact support.',
        );
        setVersion((v) => v + 1);
      } else
        setError(
          'The result could not be confirmed. Retry this same request; your bid remains active.',
        );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="agn-bid-request" aria-label="Bid commitment and review">
      {verifying && (
        <ActionVerificationDialog
          open
          purpose="bid-cancellation"
          lotId={lotId}
          onClose={() => setVerifying(false)}
          onVerified={(result) => {
            if (result.verificationId) verified(result.verificationId);
          }}
        />
      )}
      {!compact && state?.commitment && (
        <p>
          <strong>
            {state.commitment.automatic
              ? 'Your latest private limit'
              : 'Your latest accepted bid'}
            : {formatNaira(state.commitment.maxKobo)}
          </strong>
        </p>
      )}
      {!compact && <p>{LIVE_BID_COMMITMENT_NOTICE}</p>}
      {success && (
        <Toast tone="success" onClose={() => setSuccess('')}>
          {success}
        </Toast>
      )}
      {error && !open && (
        <Toast tone="error" onClose={() => setError('')}>
          {error}{' '}
          <Button size="small" onClick={() => setVersion((v) => v + 1)}>
            Retry review status
          </Button>
        </Toast>
      )}
      {state?.conversation ? (
        <>
          <p className="agn-bid-request-status">
            <strong>{statusLabel(state.conversation.status)}</strong> ·{' '}
            {state.conversation.number}
          </p>
          <a
            className="agn-button agn-detail-wallet-action"
            href={'/customer-service?conversation=' + state.conversation.id}
          >
            View request
          </a>
          {!state.feeConsent && state.canRequest && (
            <Button variant="danger" onClick={() => setOpen(true)}>
              Review cancellation fee
            </Button>
          )}
          {!compact && (
            <p className="agn-hint">
              A resolved conversation does not mean your bid was cancelled. Open
              it to read the staff response.
            </p>
          )}
        </>
      ) : (
        state?.canRequest && (
          <Button
            size={compact ? 'small' : 'regular'}
            variant="danger"
            onClick={() => setOpen(true)}
          >
            Request bid cancellation
          </Button>
        )
      )}
      {open && !verifying && (
        <Dialog
          open
          title="Request bid cancellation"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <BuyerStack>
            <p className="agn-detail-bid-notice">
              {LIVE_BID_COMMITMENT_NOTICE} This sends a request to our support
              team. It does not pause the auction, cancel your bid or release
              funds. The auction may end before staff reply.
            </p>
            <p className="agn-detail-bid-notice">
              <strong>Requesting review is free.</strong> If staff approve and
              complete cancellation, the fee is {(state?.feeBps ?? 0) / 100}% of
              the public bid price at approval. Remaining reserved funds are
              released. A cancelled leader’s auction reopens for fresh bids; you
              cannot bid on this item again. Pre-bid cancellation before launch
              is free.
            </p>
            {error && (
              <Toast tone="error" onClose={() => setError('')}>
                {error}
              </Toast>
            )}
            <label className="agn-field">
              Reason for your request
              <textarea
                className="agn-input"
                rows={4}
                minLength={10}
                maxLength={1000}
                disabled={busy || !!pending.current}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label className="agn-consent">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy || !!pending.current}
                onChange={(event) => setAck(event.target.checked)}
              />
              I accept the cancellation fee above if staff complete
              cancellation, and understand my bid and reserved funds remain
              active until then.
            </label>
            <Button
              busy={busy}
              disabled={!ack || reason.trim().length < 10}
              onClick={() => void submit()}
            >
              {pending.current
                ? 'Retry same request'
                : 'Send request to support'}
            </Button>
          </BuyerStack>
        </Dialog>
      )}
    </section>
  );
}
