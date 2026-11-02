'use client';
import { useRef, useState } from 'react';
import { createPreBidClient } from '@auction-ng/api-client/prebids';
import { ApiError } from '@auction-ng/api-client/auth';
import type { PreBidSchedule } from '@auction-ng/shared/prebid-schemas';
import type { TopDealRow } from '@auction-ng/ui/web/top-deal-manager';
import { Input } from '@auction-ng/ui/web/input';
import { Button } from '@auction-ng/ui/web/button';
const local = (value: string) =>
  new Date(Date.parse(value) + 3600000).toISOString().slice(0, 16);
export function ScheduleControl({
  lot,
  accessToken,
  deviceId,
  disabled,
  onSaved,
}: {
  lot: TopDealRow;
  accessToken: string;
  deviceId: string;
  disabled: boolean;
  onSaved: (value: {
    status: 'scheduled' | 'cancelled';
    startsAt: string;
    endsAt: string;
    updatedAt: string;
  }) => void;
}) {
  const [starts, setStarts] = useState(local(lot.startsAt)),
    [ends, setEnds] = useState(local(lot.endsAt)),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<PreBidSchedule | undefined>(undefined);
  if (!['draft', 'scheduled'].includes(lot.status)) return null;
  const save = async (action: 'schedule' | 'cancel') => {
    if (busy || disabled) return;
    pending.current ??= {
      action,
      startsAt: starts
        ? new Date(starts + ':00+01:00').toISOString()
        : undefined,
      endsAt: ends ? new Date(ends + ':00+01:00').toISOString() : undefined,
      expectedUpdatedAt: lot.updatedAt,
      idempotencyKey: crypto.randomUUID(),
      reason,
    };
    setBusy(true);
    setError('');
    try {
      const result = await createPreBidClient(
        process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
        { accessToken, deviceId },
      ).schedule(lot.id, pending.current);
      pending.current = undefined;
      onSaved(result);
    } catch (e) {
      if (e instanceof ApiError && [400, 403, 409].includes(e.status)) {
        pending.current = undefined;
        setError(
          'Schedule not saved. Check the photo, future times and current lot details, then reload.',
        );
      } else setError('Schedule result is uncertain. Retry this same request.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="agn-admin-relist"
      aria-label={'Schedule ' + lot.lotNumber}
    >
      <div>
        <strong>Upcoming auction</strong>
        <p>
          Times are WAT. Rescheduling or cancellation cancels pre-bids and
          releases reservations.
        </p>
      </div>
      <fieldset
        disabled={busy || disabled || !!pending.current}
        className="agn-auction-fee-fields"
      >
        <Input
          label="Goes live (WAT)"
          type="datetime-local"
          value={starts}
          onChange={(e) => setStarts(e.target.value)}
        />
        <Input
          label="Closes (WAT)"
          type="datetime-local"
          value={ends}
          onChange={(e) => setEnds(e.target.value)}
        />
        <Input
          label="Schedule change reason"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </fieldset>
      {error && (
        <p role="alert" className="agn-field-error">
          {error}
        </p>
      )}
      <div className="agn-prebid-actions">
        <Button
          busy={busy}
          disabled={
            disabled ||
            reason.trim().length < 5 ||
            (!pending.current && (!starts || !ends))
          }
          onClick={() => void save(pending.current?.action ?? 'schedule')}
        >
          {pending.current
            ? 'Retry schedule request'
            : lot.status === 'scheduled'
              ? 'Reschedule auction'
              : 'Schedule auction'}
        </Button>
        {lot.status === 'scheduled' && (
          <Button
            variant="danger"
            disabled={
              busy || disabled || !!pending.current || reason.trim().length < 5
            }
            onClick={() => void save('cancel')}
          >
            Cancel upcoming auction
          </Button>
        )}
      </div>
    </section>
  );
}
