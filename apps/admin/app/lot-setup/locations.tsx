'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  PICKUP_FREE_WORKING_DAYS,
  PICKUP_STORAGE_DAILY_KOBO,
  formatNaira,
  staffInitials,
  weekdays,
  type LocationCard,
  type LocationDetail,
} from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Switch } from '@auction-ng/ui/admin/switch';
import { MapPin } from '@auction-ng/ui/web/icons';
import {
  describeFailure,
  downloadCsv,
  errorFor,
  useLoad,
  useSetupClient,
  type FieldErrors,
  type SetupContext,
} from './setup-data';
import type { TabActions } from './workspace';

type Day = (typeof weekdays)[number] | 'holiday';
const days: Day[] = [...weekdays, 'holiday'];
const dayLabel: Record<Day, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
  holiday: 'Public holidays',
};
type Hours = { day: Day; opens: string | null; closes: string | null };

const defaultHours = (): Hours[] =>
  days.map((day) =>
    day === 'sunday' || day === 'holiday'
      ? { day, opens: null, closes: null }
      : day === 'saturday'
        ? { day, opens: '10:00', closes: '16:00' }
        : { day, opens: '09:00', closes: '18:00' },
  );

const clock = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${suffix}`;
};
const span = (h: Hours) =>
  h.opens && h.closes ? `${clock(h.opens)} - ${clock(h.closes)}` : 'Closed';

// Groups Monday–Friday when they share the same hours, as in the mockup.
function hoursSummary(hours: Hours[]) {
  const byDay = new Map(hours.map((h) => [h.day, h]));
  const weekday = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
  ] as const;
  const first = byDay.get('monday');
  const same =
    first && weekday.every((d) => span(byDay.get(d) ?? first) === span(first));
  const rows: { label: string; value: string }[] = [];
  if (same && first)
    rows.push({ label: 'Monday - Friday', value: span(first) });
  else
    for (const d of weekday) {
      const h = byDay.get(d);
      if (h) rows.push({ label: dayLabel[d], value: span(h) });
    }
  for (const d of ['saturday', 'sunday', 'holiday'] as const) {
    const h = byDay.get(d);
    if (h) rows.push({ label: dayLabel[d], value: span(h) });
  }
  return rows;
}

const statusText = (l: { status: string; opensOn: string | null }) =>
  l.status === 'opening' && l.opensOn
    ? `Opening ${new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(l.opensOn))}`
    : l.status === 'closed'
      ? 'Closed'
      : 'Open';
const statusTone = (status: string) =>
  status === 'open' ? 'green' : status === 'opening' ? 'indigo' : 'grey';

type Draft = {
  name: string;
  code: string;
  address: string;
  landmark: string;
  phone: string;
  lat: string;
  lng: string;
  opensOn: string;
  fee: number;
  slotMinutes: number;
  slotCapacity: string;
  idRequired: boolean;
  deliveryEnabled: boolean;
  binRequiredToPublish: boolean;
  hours: Hours[];
};
const blank = (): Draft => ({
  name: '',
  code: '',
  address: '',
  landmark: '',
  phone: '',
  lat: '',
  lng: '',
  opensOn: '',
  fee: PICKUP_STORAGE_DAILY_KOBO,
  slotMinutes: 30,
  slotCapacity: '40',
  idRequired: true,
  deliveryEnabled: false,
  binRequiredToPublish: false,
  hours: defaultHours(),
});
const fromDetail = (d: LocationDetail): Draft => ({
  name: d.name,
  code: d.code,
  address: d.address,
  landmark: d.landmark ?? '',
  phone: d.phone ?? '',
  lat: d.lat === null ? '' : String(d.lat),
  lng: d.lng === null ? '' : String(d.lng),
  opensOn: d.opensOn ?? '',
  fee: d.storageFeeKoboPerDay,
  slotMinutes: d.slotMinutes,
  slotCapacity: String(d.slotCapacity),
  idRequired: d.idRequired,
  deliveryEnabled: d.deliveryEnabled,
  binRequiredToPublish: d.binRequiredToPublish,
  hours: d.hours.map((h) => ({ ...h, day: h.day as Day })),
});

export function LocationsTab({
  ctx,
  selected,
  onSelect,
  onManageBins,
  register,
}: {
  ctx: SetupContext;
  selected: string;
  onSelect: (id: string) => void;
  onManageBins: (id: string) => void;
  register: (actions: TabActions) => void;
}) {
  const client = useSetupClient(ctx);
  const [version, setVersion] = useState(0);
  const list = useLoad(ctx, () => client.locations(), [version]);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const active = creating ? '' : selected || items[0]?.id || '';
  useEffect(() => {
    register({
      create: () => setCreating(true),
      exportCsv: () =>
        downloadCsv('pickup-locations.csv', [
          [
            'Location',
            'Code',
            'Address',
            'Status',
            'Lots here',
            'Pickups today',
            'Bins used %',
          ],
          ...items.map((l) => [
            l.name,
            l.code,
            l.address,
            statusText(l),
            l.lotsHere,
            l.pickupsToday,
            l.binsUsedPercent,
          ]),
        ]),
    });
  }, [register, items]);

  if (list.loading && !list.data)
    return (
      <div
        className="lv-setup-split lv-setup-split--locations"
        aria-busy="true"
      >
        <div className="lv-setup-card lv-setup-skeleton" />
        <div className="lv-setup-card lv-setup-skeleton lv-setup-skeleton--tall" />
      </div>
    );
  if (list.error && !list.data)
    return (
      <div className="lv-setup-card lv-setup-state" role="alert">
        <p>{list.error}</p>
        <Button variant="secondary" onClick={list.refresh}>
          Try again
        </Button>
      </div>
    );
  if (!items.length && !creating)
    return (
      <div className="lv-setup-card lv-setup-state">
        <h2>No pickup locations yet. Create the first one.</h2>
        <p>Every lot is stored at a location, where buyers collect it.</p>
        {ctx.canManage && (
          <Button onClick={() => setCreating(true)}>New location</Button>
        )}
      </div>
    );
  return (
    <>
      {notice && (
        <p className="lv-setup-toast" role="status">
          {notice}
        </p>
      )}
      <div className="lv-setup-split lv-setup-split--locations">
        <div className="lv-setup-location-list">
          {items.map((l) => (
            <LocationCardView
              key={l.id}
              location={l}
              active={l.id === active}
              onClick={() => {
                setCreating(false);
                setNotice('');
                onSelect(l.id);
              }}
            />
          ))}
          <p className="lv-setup-muted lv-setup-small">
            A location that has held lots can’t be deleted. Close it instead; it
            stops appearing for new lots and pickups.
          </p>
        </div>
        {creating ? (
          <LocationEditor
            onNotice={setNotice}
            key="new"
            ctx={ctx}
            initial={blank()}
            onCancel={() => setCreating(false)}
            onSaved={(id) => {
              setCreating(false);
              onSelect(id);
              setVersion((v) => v + 1);
              ctx.onChanged();
            }}
            onManageBins={onManageBins}
          />
        ) : active ? (
          <LocationDetailPanel
            key={active}
            onNotice={setNotice}
            ctx={ctx}
            id={active}
            onChanged={() => {
              setVersion((v) => v + 1);
              ctx.onChanged();
            }}
            onDeleted={() => {
              onSelect('');
              setVersion((v) => v + 1);
              ctx.onChanged();
            }}
            onManageBins={onManageBins}
          />
        ) : null}
      </div>
    </>
  );
}

function LocationCardView({
  location: l,
  active,
  onClick,
}: {
  location: LocationCard;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="lv-setup-card lv-setup-location"
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
    >
      <span className="lv-setup-location-top">
        <span className="lv-setup-icon" aria-hidden="true">
          <MapPin size={18} />
        </span>
        <span className="lv-setup-location-name">
          <strong>
            {l.name} <span className="lv-setup-code">· {l.code}</span>
          </strong>
          <small>{l.address}</small>
        </span>
        <span className="lv-setup-pill" data-tone={statusTone(l.status)}>
          {statusText(l)}
        </span>
      </span>
      <span className="lv-setup-location-stats">
        <span>
          <small>Lots here</small>
          <b>{l.lotsHere.toLocaleString('en-NG')}</b>
        </span>
        <span>
          <small>Pickups today</small>
          <b>
            {l.status === 'open' ? l.pickupsToday.toLocaleString('en-NG') : '—'}
          </b>
        </span>
        <span className="lv-setup-bins-meter">
          <small>Bins in use</small>
          <span className="lv-setup-meter" aria-hidden="true">
            <span
              data-high={l.binsUsedPercent >= 90 || undefined}
              style={{ width: `${l.binsUsedPercent}%` }}
            />
          </span>
          <b>{l.binsUsedPercent}%</b>
        </span>
      </span>
    </button>
  );
}

function LocationDetailPanel({
  onNotice,
  ctx,
  id,
  onChanged,
  onDeleted,
  onManageBins,
}: {
  onNotice: (message: string) => void;
  ctx: SetupContext;
  id: string;
  onChanged: () => void;
  onDeleted: () => void;
  onManageBins: (id: string) => void;
}) {
  const client = useSetupClient(ctx);
  const [version, setVersion] = useState(0);
  const detail = useLoad(ctx, () => client.location(id), [id, version]);
  if (detail.loading && !detail.data)
    return (
      <div
        className="lv-setup-card lv-setup-skeleton lv-setup-skeleton--tall"
        aria-busy="true"
      />
    );
  if (!detail.data)
    return (
      <div className="lv-setup-card lv-setup-state" role="alert">
        <p>{detail.error || 'This location could not be loaded.'}</p>
        <Button variant="secondary" onClick={detail.refresh}>
          Try again
        </Button>
      </div>
    );
  return (
    <LocationEditor
      key={detail.data.updatedAt}
      onNotice={onNotice}
      ctx={ctx}
      detail={detail.data}
      initial={fromDetail(detail.data)}
      onSaved={() => {
        setVersion((v) => v + 1);
        onChanged();
      }}
      onDeleted={onDeleted}
      onManageBins={onManageBins}
    />
  );
}

function LocationEditor({
  onNotice,
  ctx,
  detail,
  initial,
  onSaved,
  onCancel,
  onDeleted,
  onManageBins,
}: {
  onNotice: (message: string) => void;
  ctx: SetupContext;
  detail?: LocationDetail;
  initial: Draft;
  onSaved: (id: string) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
  onManageBins: (id: string) => void;
}) {
  const client = useSetupClient(ctx);
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [editHours, setEditHours] = useState(!detail);
  const [staffOpen, setStaffOpen] = useState(false);
  const editable = ctx.canManage;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const coordinate = (v: string) => (v.trim() === '' ? null : Number(v));

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const lat = coordinate(draft.lat);
      const lng = coordinate(draft.lng);
      if (
        (lat !== null && Number.isNaN(lat)) ||
        (lng !== null && Number.isNaN(lng))
      ) {
        setErrors({
          lat: 'Use numbers for the map pin, e.g. 6.6018 and 3.3515.',
        });
        return;
      }
      const result = await client.saveLocation({
        ...(detail
          ? { id: detail.id, expectedUpdatedAt: detail.updatedAt }
          : {}),
        name: draft.name,
        code: draft.code,
        address: draft.address,
        landmark: draft.landmark,
        phone: draft.phone,
        lat,
        lng,
        opensOn: draft.opensOn || null,
        storageFeeKoboPerDay: draft.fee,
        slotMinutes: draft.slotMinutes,
        slotCapacity: Number(draft.slotCapacity) || 0,
        idRequired: draft.idRequired,
        deliveryEnabled: draft.deliveryEnabled,
        binRequiredToPublish: draft.binRequiredToPublish,
        hours: draft.hours,
      });
      onNotice(result.message);
      setEditHours(false);
      onSaved(result.id);
    } catch (failure) {
      setErrors(describeFailure(failure, ctx));
    } finally {
      setBusy(false);
    }
  }
  async function act(
    work: () => Promise<{ message: string }>,
    after?: () => void,
  ) {
    setBusy(true);
    setErrors({});
    try {
      onNotice((await work()).message);
      after?.();
    } catch (failure) {
      setErrors(describeFailure(failure, ctx));
    } finally {
      setBusy(false);
    }
  }
  const mapHref =
    draft.lat && draft.lng
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(draft.lat)}&mlon=${encodeURIComponent(draft.lng)}#map=17/${encodeURIComponent(draft.lat)}/${encodeURIComponent(draft.lng)}`
      : null;

  return (
    <div className="lv-setup-stack">
      {errors.form && (
        <p className="lv-setup-alert" role="alert">
          {errors.form}
        </p>
      )}
      <section className="lv-setup-card" aria-labelledby="loc-details">
        <div className="lv-setup-card-head">
          <h2 id="loc-details" className="lv-setup-title-row">
            {draft.name || 'New location'}
            {detail && (
              <span
                className="lv-setup-pill"
                data-tone={statusTone(detail.status)}
              >
                <span aria-hidden="true">●</span> {statusText(detail)}
              </span>
            )}
          </h2>
          {detail && (
            <p className="lv-setup-muted lv-setup-small">
              Used on {detail.usedOnLots.toLocaleString('en-NG')} lots · created{' '}
              {new Intl.DateTimeFormat('en-NG', {
                day: 'numeric',
                month: 'short',
                timeZone: 'Africa/Lagos',
              }).format(new Date(detail.createdAt))}
            </p>
          )}
        </div>
        <div className="lv-setup-location-form">
          <div className="lv-setup-grid lv-setup-grid--2">
            <Input
              label="Name buyers see"
              value={draft.name}
              disabled={!editable}
              error={errorFor(errors, 'name')}
              maxLength={120}
              onChange={(e) => set('name', e.target.value)}
            />
            <Input
              label="Short code"
              value={draft.code}
              disabled={!editable}
              error={errorFor(errors, 'code')}
              hint="3 letters. Printed on labels and pickup codes."
              maxLength={3}
              onChange={(e) =>
                set('code', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
              }
            />
            <div className="lv-setup-span-2">
              <Input
                label="Address"
                value={draft.address}
                disabled={!editable}
                error={errorFor(errors, 'address')}
                maxLength={300}
                onChange={(e) => set('address', e.target.value)}
              />
            </div>
            <Input
              label="Landmark"
              value={draft.landmark}
              disabled={!editable}
              error={errorFor(errors, 'landmark')}
              maxLength={160}
              onChange={(e) => set('landmark', e.target.value)}
            />
            <Input
              label="Phone for buyers"
              value={draft.phone}
              disabled={!editable}
              error={errorFor(errors, 'phone')}
              inputMode="tel"
              maxLength={20}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div className="lv-setup-map">
            <div className="lv-setup-map-box" aria-hidden="true">
              <MapPin size={32} />
            </div>
            <div className="lv-setup-grid lv-setup-grid--2">
              <Input
                label="Latitude"
                value={draft.lat}
                disabled={!editable}
                error={errorFor(errors, 'lat')}
                inputMode="decimal"
                onChange={(e) => set('lat', e.target.value)}
              />
              <Input
                label="Longitude"
                value={draft.lng}
                disabled={!editable}
                error={errorFor(errors, 'lng')}
                inputMode="decimal"
                onChange={(e) => set('lng', e.target.value)}
              />
            </div>
            {mapHref ? (
              <a
                className="lv-setup-link"
                href={mapHref}
                target="_blank"
                rel="noreferrer"
              >
                Open the pin in a map
              </a>
            ) : (
              <p className="lv-setup-muted lv-setup-small">
                Add the map pin for the exact gate.
              </p>
            )}
          </div>
        </div>
        <Input
          label="Opening on (optional)"
          type="date"
          value={draft.opensOn}
          disabled={!editable}
          error={errorFor(errors, 'opensOn')}
          hint="For a new hub: shows as “Opening” until this date."
          onChange={(e) => set('opensOn', e.target.value)}
        />
      </section>

      <div className="lv-setup-grid lv-setup-grid--2 lv-setup-gap">
        <section className="lv-setup-card" aria-labelledby="loc-hours">
          <div className="lv-setup-card-head">
            <h3 id="loc-hours">Opening hours</h3>
            {editable && !editHours && (
              <button
                type="button"
                className="lv-setup-link"
                onClick={() => setEditHours(true)}
              >
                Edit
              </button>
            )}
          </div>
          {editHours ? (
            <div className="lv-setup-hours-edit">
              {draft.hours.map((h, index) => {
                const update = (patch: Partial<Hours>) =>
                  set(
                    'hours',
                    draft.hours.map((x, i) =>
                      i === index ? { ...x, ...patch } : x,
                    ),
                  );
                const closed = !h.opens;
                return (
                  <fieldset
                    key={h.day}
                    className="lv-setup-hours-row"
                    disabled={!editable}
                  >
                    <legend>{dayLabel[h.day]}</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={closed}
                        onChange={(e) =>
                          update(
                            e.target.checked
                              ? { opens: null, closes: null }
                              : { opens: '09:00', closes: '18:00' },
                          )
                        }
                      />{' '}
                      Closed
                    </label>
                    {!closed && (
                      <>
                        <input
                          type="time"
                          aria-label={`${dayLabel[h.day]} opens`}
                          value={h.opens ?? ''}
                          onChange={(e) => update({ opens: e.target.value })}
                        />
                        <span aria-hidden="true">to</span>
                        <input
                          type="time"
                          aria-label={`${dayLabel[h.day]} closes`}
                          value={h.closes ?? ''}
                          onChange={(e) => update({ closes: e.target.value })}
                        />
                      </>
                    )}
                  </fieldset>
                );
              })}
              {errorFor(errors, 'hours') && (
                <p className="lv-setup-error">{errorFor(errors, 'hours')}</p>
              )}
            </div>
          ) : (
            <dl className="lv-setup-hours">
              {hoursSummary(draft.hours).map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd data-closed={row.value === 'Closed' || undefined}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="lv-setup-muted lv-setup-small">
            Pickup hours for this location, in Lagos time (WAT).
          </p>
        </section>

        <section className="lv-setup-card" aria-labelledby="loc-rules">
          <h3 id="loc-rules">Pickup rules</h3>
          <div className="lv-setup-grid lv-setup-grid--2">
            <Input
              label="Free collection"
              value={`${PICKUP_FREE_WORKING_DAYS} working days`}
              readOnly
              disabled
              hint="Same at every location."
            />
            <NairaInput
              key={'fee:' + initial.fee}
              label="Storage fee after (per day)"
              initialValue={String(draft.fee / 100)}
              digitsOnly
              prefix="₦"
              disabled={!editable}
              error={errorFor(errors, 'storageFeeKoboPerDay')}
              hint={`${formatNaira(draft.fee)} / day. Applies to items marked ready from now on.`}
              onAmountChange={(kobo) => set('fee', kobo ?? 0)}
            />
            <Select
              label="Slot length"
              value={draft.slotMinutes}
              disabled={!editable}
              error={errorFor(errors, 'slotMinutes')}
              onChange={(e) => set('slotMinutes', Number(e.target.value))}
            >
              {[15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
            <Input
              label="Buyers per slot"
              inputMode="numeric"
              value={draft.slotCapacity}
              disabled={!editable}
              error={errorFor(errors, 'slotCapacity')}
              onChange={(e) =>
                set(
                  'slotCapacity',
                  e.target.value.replace(/\D/g, '').slice(0, 5),
                )
              }
            />
          </div>
          <div className="lv-setup-switches">
            <Switch
              label="Ask for ID that matches the account name"
              checked={draft.idRequired}
              disabled={!editable}
              onChange={(v) => set('idRequired', v)}
            />
            <Switch
              label="Offer delivery from this hub (when delivery launches)"
              checked={draft.deliveryEnabled}
              disabled={!editable}
              onChange={(v) => set('deliveryEnabled', v)}
            />
          </div>
        </section>
      </div>

      {detail ? (
        <section className="lv-setup-card" aria-labelledby="loc-bins">
          <div className="lv-setup-card-head">
            <div>
              <h3 id="loc-bins">Bins</h3>
              <p className="lv-setup-card-note">
                {detail.bins.total} bins · {detail.bins.inUse} in use ·{' '}
                {detail.bins.lotsStored.toLocaleString('en-NG')} lots stored. A
                bin is any named spot: a shelf, a cage, a corner.
              </p>
            </div>
            <Button size="small" onClick={() => onManageBins(detail.id)}>
              Manage bins
            </Button>
          </div>
          <div className="lv-setup-bin-chips">
            {detail.bins.preview.map((b) => (
              <span
                key={b.code}
                className="lv-setup-chip lv-setup-chip--static"
              >
                {b.code}{' '}
                <span className="lv-setup-muted">
                  {b.lots ? `${b.lots.toLocaleString('en-NG')} lots` : 'empty'}
                </span>
              </span>
            ))}
            {detail.bins.total > detail.bins.preview.length && (
              <span className="lv-setup-muted">
                +{detail.bins.total - detail.bins.preview.length} more
              </span>
            )}
            {!detail.bins.total && (
              <span className="lv-setup-muted">
                No bins yet. Add shelves, cages or floor spots so staff can find
                items at pickup.
              </span>
            )}
          </div>
        </section>
      ) : null}

      <section
        className="lv-setup-card lv-setup-staff-row"
        aria-label="Staff and actions"
      >
        <div>
          {detail && (
            <>
              <ul className="lv-setup-people">
                {detail.staff.map((s) => (
                  <li key={s.id}>
                    <span className="lv-setup-avatar" aria-hidden="true">
                      {staffInitials(s.name)}
                    </span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.roleName}</small>
                    </span>
                  </li>
                ))}
                {!detail.staff.length && (
                  <li className="lv-setup-muted">No staff assigned yet.</li>
                )}
              </ul>
              {editable && (
                <button
                  type="button"
                  className="lv-setup-link"
                  onClick={() => setStaffOpen(true)}
                >
                  Manage staff
                </button>
              )}
            </>
          )}
        </div>
        {editable && (
          <div className="lv-setup-actions">
            {!detail && (
              <Button variant="secondary" disabled={busy} onClick={onCancel}>
                Cancel
              </Button>
            )}
            {detail && detail.deleteCheck.allowed && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${detail.name}? This can't be undone.`,
                    )
                  )
                    void act(
                      () =>
                        client.deleteLocation({
                          id: detail.id,
                          expectedUpdatedAt: detail.updatedAt,
                        }),
                      onDeleted,
                    );
                }}
              >
                Delete location
              </Button>
            )}
            {detail && !detail.deleteCheck.allowed && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const closing = detail.status !== 'closed';
                  if (
                    !closing ||
                    window.confirm(
                      `Close ${detail.name}? It disappears from new lots and new pickups. Existing lots stay here.`,
                    )
                  )
                    void act(
                      () =>
                        client.closeLocation({
                          id: detail.id,
                          closed: closing,
                          expectedUpdatedAt: detail.updatedAt,
                        }),
                      () => onSaved(detail.id),
                    );
                }}
              >
                {detail.status === 'closed'
                  ? 'Reopen location'
                  : 'Close location'}
              </Button>
            )}
            <Button
              busy={busy}
              disabled={!!detail && !dirty}
              onClick={() => void save()}
            >
              {detail ? 'Save changes' : 'Create location'}
            </Button>
          </div>
        )}
      </section>
      {staffOpen && detail && (
        <StaffDialog
          ctx={ctx}
          detail={detail}
          onClose={() => setStaffOpen(false)}
          onSaved={(message) => {
            setStaffOpen(false);
            onNotice(message);
            onSaved(detail.id);
          }}
        />
      )}
    </div>
  );
}

function StaffDialog({
  ctx,
  detail,
  onClose,
  onSaved,
}: {
  ctx: SetupContext;
  detail: LocationDetail;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const client = useSetupClient(ctx);
  const options = useLoad(ctx, () => client.staffOptions(), []);
  const [chosen, setChosen] = useState(
    () => new Set(detail.staff.map((s) => s.id)),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open title={`Staff at ${detail.name}`} onClose={onClose}>
      <div className="lv-setup-form">
        {options.loading && !options.data && (
          <p role="status">Loading staff…</p>
        )}
        {options.error && <p className="lv-setup-error">{options.error}</p>}
        <ul className="lv-setup-checklist">
          {options.data?.items.map((s) => (
            <li key={s.id}>
              <label>
                <input
                  type="checkbox"
                  checked={chosen.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setChosen(next);
                  }}
                />{' '}
                {s.name} <span className="lv-setup-muted">· {s.roleName}</span>
              </label>
            </li>
          ))}
        </ul>
        {error && <p className="lv-setup-error">{error}</p>}
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await client.locationStaff({
                  id: detail.id,
                  staffIds: [...chosen],
                });
                onSaved(result.message);
              } catch (failure) {
                setError(
                  Object.values(describeFailure(failure, ctx))[0] ??
                    'Not saved.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Save staff
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
