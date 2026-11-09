'use client';
import { useEffect, useRef, useState } from 'react';
import type { createSupportClient } from '@auction-ng/api-client/support';
import type {
  BidCancellationApprovalInput,
  SupportConversation,
} from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Textarea } from '@auction-ng/ui/web/textarea';
import { Toast } from '@auction-ng/ui/web/toast';
import { BuyerStack, MoneyLine } from '@auction-ng/ui/web/buyer';
type Client = ReturnType<typeof createSupportClient>;
export function BidCancellationApproval({
  conversation,
  client,
}: {
  conversation: SupportConversation;
  client: Client;
}) {
  const [quote, setQuote] =
      useState<Awaited<ReturnType<Client['cancellationQuote']>>>(),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  const pending = useRef<BidCancellationApprovalInput | undefined>(undefined);
  useEffect(() => {
    let active = true;
    if (pending.current) return;
    void client
      .cancellationQuote(conversation.id)
      .then((value) => {
        if (active) {
          setQuote(value);
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Approval unavailable. The buyer must confirm the fee, and the auction must still be open. Refresh to check the latest state.',
          );
      });
    return () => {
      active = false;
    };
  }, [conversation.id, client, version]);
  const approve = async () => {
    if (!quote || busy) return;
    pending.current ??= {
      expectedStreamId: quote.streamId,
      expectedFeeKobo: quote.feeKobo,
      reason: reason.trim(),
      idempotencyKey: crypto.randomUUID(),
    };
    setBusy(true);
    setError('');
    try {
      const result = await client.approveCancellation(
        conversation.id,
        pending.current,
      );
      if (result.status === 'completed') {
        pending.current = undefined;
        setOpen(false);
        setNotice(
          'Cancellation completed. The fee was charged once and affected bid funds released.',
        );
        setVersion((v) => v + 1);
      } else if (result.status === 'failed') {
        pending.current = undefined;
        setOpen(false);
        setError(
          'No cancellation fee was charged. The price changed or available funds were insufficient. Refresh and review again.',
        );
        setVersion((v) => v + 1);
      } else
        setNotice(
          'Approval is processing safely. Retry this same request to check completion.',
        );
    } catch {
      setError(
        'The approval result could not be confirmed. Retry this same approval; do not create another request.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="agn-bid-request"
      aria-label="Staff bid cancellation approval"
    >
      <BuyerStack>
        <strong>Bid cancellation approval</strong>
        {error && (
          <Toast tone="error" onClose={() => setError('')}>
            {error}
          </Toast>
        )}
        {notice && (
          <Toast tone="success" onClose={() => setNotice('')}>
            {notice}
          </Toast>
        )}
        {!pending.current && (
          <Button
            size="small"
            onClick={() => {
              setError('');
              setVersion((v) => v + 1);
            }}
          >
            Refresh cancellation quote
          </Button>
        )}
        {quote && (
          <>
            <p>
              {quote.buyerName} · Item {quote.lotNumber}
            </p>
            <MoneyLine
              label="Public bid price"
              value={formatNaira(quote.priceKobo)}
            />
            <MoneyLine
              label={`Cancellation fee (${quote.premiumBps / 100}%)`}
              value={formatNaira(quote.feeKobo)}
              total
            />
            <p className="agn-detail-bid-notice">
              {quote.isLeader
                ? 'Cancelling the leader reopens bidding at the starting price for at least ten minutes. Previous bids become history; notify bidders and watchers to place fresh bids.'
                : 'The current leader, price and deadline remain unchanged.'}{' '}
              The cancelled buyer cannot bid again on this item.
            </p>
            {quote.status === 'completed' ? (
              <strong>Cancellation completed</strong>
            ) : (
              <>
                <Textarea
                  label="Approval reason"
                  value={reason}
                  maxLength={500}
                  disabled={busy || !!pending.current}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button
                  variant="danger"
                  disabled={
                    busy ||
                    (!pending.current &&
                      (reason.trim().length < 10 ||
                        quote.status !== 'available'))
                  }
                  onClick={() =>
                    pending.current ? void approve() : setOpen(true)
                  }
                >
                  {pending.current
                    ? 'Retry same approval'
                    : 'Review and approve cancellation'}
                </Button>
              </>
            )}
          </>
        )}
        {open && quote && (
          <Dialog
            open
            title="Approve paid bid cancellation"
            onClose={() => {
              if (!busy) setOpen(false);
            }}
          >
            <BuyerStack>
              <p>
                Charge {formatNaira(quote.feeKobo)} ({quote.premiumBps / 100}%
                of {formatNaira(quote.priceKobo)}) to {quote.buyerName} and
                complete this cancellation?
              </p>
              <p>
                This changes bids and wallet funds. The system rejects a stale
                price quote. The cancelled buyer is blocked from bidding on this
                item.
              </p>
              {error && (
                <Toast tone="error" onClose={() => setError('')}>
                  {error}
                </Toast>
              )}
              <Button
                variant="danger"
                busy={busy}
                onClick={() => void approve()}
              >
                {pending.current
                  ? 'Retry same approval'
                  : 'Charge fee and complete cancellation'}
              </Button>
            </BuyerStack>
          </Dialog>
        )}
      </BuyerStack>
    </section>
  );
}
