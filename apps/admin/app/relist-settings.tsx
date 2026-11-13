'use client';
import { useEffect, useMemo, useState } from 'react';
import type { RelistSettings } from '@auction-ng/shared/relist-schemas';
import { createRelistClient } from '@auction-ng/api-client/relist';
import { ApiError } from '@auction-ng/api-client/auth';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const RUN_CHOICES = [6, 12, 24, 48, 72, 168];

// Settings › Fees and rules › Unsold items (owner decision 2026-11-13).
export function RelistSettingsCard({
  accessToken,
  deviceId,
  online,
}: {
  accessToken: string;
  deviceId: string;
  online: boolean;
}) {
  const client = useMemo(
    () => createRelistClient(apiUrl, { accessToken, deviceId }),
    [accessToken, deviceId],
  );
  const [saved, setSaved] = useState<RelistSettings>();
  const [retries, setRetries] = useState(2);
  const [hours, setHours] = useState(24);
  const [cut, setCut] = useState('0');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    client
      .settings()
      .then((value) => {
        if (!active) return;
        setSaved(value);
        setRetries(value.maxRetries);
        setHours(value.runHours);
        setCut(String(value.priceCutPercent));
        setError('');
      })
      .catch(() => {
        if (active)
          setError('Unsold item settings could not be loaded. Try again.');
      });
    return () => {
      active = false;
    };
  }, [client, version]);

  const cutValue = /^\d{1,2}$/.test(cut) ? Number(cut) : NaN;
  const cutError =
    Number.isInteger(cutValue) && cutValue >= 0 && cutValue <= 50
      ? ''
      : 'Enter a whole number from 0 to 50.';
  const changed =
    !!saved &&
    (retries !== saved.maxRetries ||
      hours !== saved.runHours ||
      cutValue !== saved.priceCutPercent);
  const canSave =
    online && changed && !cutError && reason.trim().length >= 5 && !busy;
  const hourOptions = [...new Set([...RUN_CHOICES, hours])].sort(
    (a, b) => a - b,
  );

  async function save() {
    if (!saved || !canSave) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const next = await client.saveSettings({
        maxRetries: retries,
        runHours: hours,
        priceCutPercent: cutValue,
        expectedRevision: saved.revision,
        reason: reason.trim(),
        idempotencyKey: key,
      });
      setSaved(next);
      setReason('');
      setKey(crypto.randomUUID());
      setSuccess('Saved. New rules apply to auctions that end from now on.');
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 409
          ? 'Another admin changed these settings. Reload them before saving.'
          : failure instanceof ApiError && failure.status === 403
            ? 'Only admins who manage fees and rules can change this.'
            : 'The change couldn’t be confirmed. Try again; it won’t be saved twice.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="lv-relist-settings" aria-labelledby="relist-settings">
      <div>
        <h2 id="relist-settings">Unsold items</h2>
        <p>
          What happens when an auction ends with no bids. After the last
          automatic relist, the item goes to Unsold review for staff to relist
          by hand.
        </p>
      </div>
      {!saved && !error ? (
        <div className="lv-unsold-skeleton" aria-busy="true" />
      ) : (
        <form
          className="lv-relist-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Select
            label="Automatic relists"
            value={String(retries)}
            onChange={(event) => setRetries(Number(event.target.value))}
            hint="0 sends every unsold item straight to Unsold review."
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'None' : `${n} ${n === 1 ? 'time' : 'times'}`}
              </option>
            ))}
          </Select>
          <Select
            label="Each relist runs for"
            value={String(hours)}
            onChange={(event) => setHours(Number(event.target.value))}
          >
            {hourOptions.map((h) => (
              <option key={h} value={h}>
                {h % 24 === 0
                  ? `${h / 24} ${h === 24 ? 'day' : 'days'}`
                  : `${h} hours`}
              </option>
            ))}
          </Select>
          <Input
            label="Lower the starting price on each automatic relist (%)"
            inputMode="numeric"
            value={cut}
            maxLength={2}
            onChange={(event) =>
              setCut(event.target.value.replace(/\D/g, '').slice(0, 2))
            }
            error={cut === '' ? undefined : cutError || undefined}
            hint={
              cutValue > 0
                ? `Example: ₦10,000 becomes ₦${(10_000 * (1 - cutValue / 100)).toLocaleString('en-NG', { maximumFractionDigits: 0 })}, then lower again on the next relist. Never below ₦500.`
                : '0 keeps the same price. Staff can still change a price when they relist by hand.'
            }
          />
          <Input
            label="Reason for the change"
            value={reason}
            maxLength={240}
            onChange={(event) => setReason(event.target.value)}
            hint="Saved in the audit log."
          />
          {error && (
            <p className="lv-relist-error" role="alert">
              {error}{' '}
              <button
                type="button"
                className="lv-admin-text-link"
                onClick={() => setVersion((v) => v + 1)}
              >
                Reload
              </button>
            </p>
          )}
          {success && (
            <p className="lv-unsold-toast" role="status">
              {success}
            </p>
          )}
          <Button type="submit" busy={busy} disabled={!canSave}>
            Save unsold item rules
          </Button>
        </form>
      )}
    </section>
  );
}
