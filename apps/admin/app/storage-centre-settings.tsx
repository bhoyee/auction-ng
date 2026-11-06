'use client';
import { useEffect, useState } from 'react';
import { createPickupStorageClient } from '@auction-ng/api-client/pickup-storage';
import { type StorageCentre } from '@auction-ng/shared';
import { parseNairaInput } from '@auction-ng/ui/presentation';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';
import { Button } from '@auction-ng/ui/web/button';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
export function StorageCentreSettings({
  accessToken,
  deviceId,
}: {
  accessToken: string;
  deviceId: string;
}) {
  const [items, setItems] = useState<StorageCentre[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [centre, setCentre] = useState<StorageCentre>();
  const [daily, setDaily] = useState('1000'),
    [cap, setCap] = useState('10000'),
    [days, setDays] = useState([1, 2, 3, 4, 5]),
    [closed, setClosed] = useState(''),
    [opens, setOpens] = useState('09:00'),
    [closes, setCloses] = useState('17:00'),
    [enabled, setEnabled] = useState(false),
    [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID());
  function client() {
    return createPickupStorageClient(
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
      { accessToken, deviceId },
    );
  }
  useEffect(() => {
    let active = true;
    void createPickupStorageClient(
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
      { accessToken, deviceId },
    )
      .centres()
      .then((v) => {
        if (active) {
          setItems(v.items);
          setCursor(v.nextCursor);
        }
      })
      .catch(() => {
        if (active) setError('Centre policies could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [accessToken, deviceId]);
  function choose(row: StorageCentre) {
    setCentre(row);
    setDaily(String(row.dailyKobo / 100));
    setCap(String(row.capKobo / 100));
    setEnabled(row.enabled);
    setDays(row.calendar?.weekdays ?? [1, 2, 3, 4, 5]);
    setClosed(row.calendar?.closedDates.join(', ') ?? '');
    const time = (n: number) =>
      String(Math.floor(n / 60)).padStart(2, '0') +
      ':' +
      String(n % 60).padStart(2, '0');
    setOpens(time(row.calendar?.opensMinute ?? 540));
    setCloses(time(row.calendar?.closesMinute ?? 1020));
    setKey(crypto.randomUUID());
    setMessage('');
  }
  async function save() {
    if (!centre || busy) return;
    setBusy(true);
    setError('');
    try {
      const dailyKobo = parseNairaInput(daily),
        capKobo = parseNairaInput(cap);
      if (dailyKobo === undefined || capKobo === undefined)
        throw Error('Invalid amount');
      const minute = (v: string) => {
        const [h, m] = v.split(':').map(Number);
        return (h ?? 0) * 60 + (m ?? 0);
      };
      const result = await client().configure({
        idempotencyKey: key,
        locationId: centre.locationId,
        expectedRevision: centre.revision,
        reason,
        enabled,
        dailyKobo,
        capKobo,
        calendar: {
          weekdays: days,
          closedDates: closed
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
          opensMinute: minute(opens),
          closesMinute: minute(closes),
        },
      });
      setMessage(result.message);
      setCentre(undefined);
      const fresh = await client().centres();
      setItems(fresh.items);
      setCursor(fresh.nextCursor);
      setKey(crypto.randomUUID());
    } catch {
      setError(
        'Policy not confirmed. Check amounts, selected days, opening/closing times and YYYY-MM-DD closure dates. Reload changed settings before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="lv-storage-form">
      {error && (
        <StaffMessage onDismiss={() => setError('')}>{error}</StaffMessage>
      )}
      {message && (
        <StaffMessage tone="success" onDismiss={() => setMessage('')}>
          {message}
        </StaffMessage>
      )}
      <Select
        label="Pickup centre"
        value={centre?.locationId ?? ''}
        onChange={(e) => {
          const row = items.find((v) => v.locationId === e.target.value);
          if (row) choose(row);
        }}
      >
        <option value="">Select a centre</option>
        {items.map((row) => (
          <option key={row.locationId} value={row.locationId}>
            {row.location}
          </option>
        ))}
      </Select>
      {cursor && (
        <Button
          onClick={() => {
            void client()
              .centres(cursor)
              .then((v) => {
                setItems((old) => [...old, ...v.items]);
                setCursor(v.nextCursor);
              })
              .catch(() => setError('More centres could not be loaded.'));
          }}
        >
          More centres
        </Button>
      )}
      {centre && (
        <>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Enable for newly ready items
          </label>
          <Input
            label="Daily storage charge"
            prefix="₦"
            inputMode="decimal"
            value={daily}
            onChange={(e) => {
              if (/^\d*(\.\d{0,2})?$/.test(e.target.value))
                setDaily(e.target.value);
            }}
          />
          <Input
            label="Maximum per item"
            prefix="₦"
            inputMode="decimal"
            value={cap}
            onChange={(e) => {
              if (/^\d*(\.\d{0,2})?$/.test(e.target.value))
                setCap(e.target.value);
            }}
          />
          <fieldset>
            <legend>Working days</legend>
            <div className="lv-storage-tools">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
                (day, index) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={days.includes(index + 1)}
                      onChange={(e) =>
                        setDays((v) =>
                          e.target.checked
                            ? [...v, index + 1].sort()
                            : v.filter((n) => n !== index + 1),
                        )
                      }
                    />
                    {day}
                  </label>
                ),
              )}
            </div>
          </fieldset>
          <Input
            label="Opens (WAT)"
            type="time"
            value={opens}
            onChange={(e) => setOpens(e.target.value)}
          />
          <Input
            label="Closes (WAT)"
            type="time"
            value={closes}
            onChange={(e) => setCloses(e.target.value)}
          />
          <Input
            label="Closed dates (YYYY-MM-DD, separated by commas)"
            value={closed}
            onChange={(e) => setClosed(e.target.value)}
            hint="Add public holidays and centre closures explicitly."
          />
          <Input
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p>
            Existing items keep their saved rate and calendar. Five working days
            are free; payment is requested explicitly at collection.
          </p>
          <Button
            busy={busy}
            disabled={reason.trim().length < 5 || !days.length}
            onClick={() => void save()}
          >
            Save policy
          </Button>
        </>
      )}
    </div>
  );
}
