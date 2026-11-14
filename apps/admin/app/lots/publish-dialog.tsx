'use client';
import { useState } from 'react';
import { ApiError } from '@auction-ng/api-client/auth';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import { hoursLabel, wat } from './lots-ui';

/** Times staff type are WAT wall-clock times. */
const watInput = (ms: number) =>
  new Date(ms + 3_600_000).toISOString().slice(0, 16);
const fromWatInput = (value: string) => Date.parse(`${value}:00+01:00`);
// "Now" is a minute ahead: the server needs a future launch time, and the
// launcher picks it up within seconds of that time.
const NOW_LEAD_MS = 60_000;

export type PublishRequest = {
  startsAt: string;
  endsAt: string;
  idempotencyKey: string;
};

/**
 * Publish a finished draft: go live in about a minute, or at a chosen time.
 * It uses the audited scheduling step, which re-checks every publish rule.
 */
export function PublishDialog({
  lotNumber,
  runTimeMinutes,
  onClose,
  publish,
}: {
  lotNumber: string;
  runTimeMinutes: number;
  onClose: () => void;
  publish: (request: PublishRequest) => Promise<void>;
}) {
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [later, setLater] = useState(() => {
    // Default: tomorrow 9:00 am WAT.
    const tomorrow = new Date(Date.now() + 3_600_000 + 86_400_000);
    return `${tomorrow.toISOString().slice(0, 10)}T09:00`;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Same key while retrying one choice, so a dropped answer can't publish twice.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [now, setNow] = useState(() => Date.now());

  const startMs =
    when === 'now' ? now + NOW_LEAD_MS : fromWatInput(later || 'x');
  const valid =
    Number.isFinite(startMs) && (when === 'now' || startMs > Date.now());
  const endMs = startMs + runTimeMinutes * 60_000;

  async function submit() {
    setBusy(true);
    setError('');
    const start = when === 'now' ? Date.now() + NOW_LEAD_MS : startMs;
    try {
      await publish({
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + runTimeMinutes * 60_000).toISOString(),
        idempotencyKey: key,
      });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status < 500) {
        // A refusal is final for this key; the next try is a new request.
        setKey(crypto.randomUUID());
        setError(
          failure.status === 403
            ? 'Your role can’t publish lots. Ask an admin or ops manager.'
            : failure.status === 409
              ? 'This lot changed or isn’t a draft any more. Close this, reload the lot and try again.'
              : failure.detail ||
                'It couldn’t be published. Check the Ready to publish list.',
        );
      } else
        setError(
          'The result is unclear (connection problem). Try again; it won’t publish twice.',
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={`Publish ${lotNumber}`}
    >
      <form
        className="lv-lots-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void submit();
        }}
      >
        <fieldset className="lv-lot-publish-when" disabled={busy}>
          <legend>When should bidding start?</legend>
          <label>
            <input
              type="radio"
              name="when"
              checked={when === 'now'}
              onChange={() => {
                setWhen('now');
                setNow(Date.now());
                setKey(crypto.randomUUID());
              }}
            />
            <span>
              <strong>Go live now</strong>
              <small>Bidding opens within about a minute.</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="when"
              checked={when === 'later'}
              onChange={() => {
                setWhen('later');
                setKey(crypto.randomUUID());
              }}
            />
            <span>
              <strong>Schedule for later</strong>
              <small>Buyers see it as upcoming and can pre-bid.</small>
            </span>
          </label>
        </fieldset>
        {when === 'later' && (
          <Input
            label="Goes live (WAT)"
            type="datetime-local"
            value={later}
            min={watInput(Date.now() + NOW_LEAD_MS)}
            disabled={busy}
            onChange={(e) => {
              setLater(e.target.value);
              setKey(crypto.randomUUID());
            }}
          />
        )}
        {valid ? (
          <p className="lv-lot-publish-summary">
            Goes live{' '}
            <strong>{wat.dateTime(new Date(startMs).toISOString())}</strong> and
            closes{' '}
            <strong>{wat.dateTime(new Date(endMs).toISOString())}</strong> (
            {hoursLabel(runTimeMinutes)}). A bid in the last 2 minutes moves the
            close to 2 minutes after that bid. Price and run time lock once it
            is scheduled.
          </p>
        ) : (
          <p className="lv-lots-error">Choose a time in the future.</p>
        )}
        {error && (
          <p className="lv-lots-error" role="alert">
            {error}
          </p>
        )}
        <div className="lv-lots-dialog-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!valid}>
            {when === 'now' ? 'Publish now' : 'Schedule lot'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
