'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createCatalogueClient } from '@auction-ng/api-client';
import { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { createPreBidClient } from '@auction-ng/api-client/prebids';
import {
  type CreateLotInput,
  type StaffRow,
  parseStaffCsv,
  STAFF_CSV_HEADERS,
  databaseValues,
} from '@auction-ng/shared';
import { parseNairaInput } from '@auction-ng/ui/presentation';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
type Props = {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  row?: StaffRow;
  online: boolean;
  onSaved: () => void;
};
const watInput = (iso: string) =>
  new Date(Date.parse(iso) + 3600000).toISOString().slice(0, 16);
const isoWat = (value: string) => new Date(value + ':00+01:00').toISOString();
export function InventoryIntake({
  apiUrl,
  accessToken,
  deviceId,
  row,
  online,
  onSaved,
}: Props) {
  const client = useMemo(
    () => createCatalogueClient(apiUrl, { accessToken, deviceId }),
    [apiUrl, accessToken, deviceId],
  );
  const admin = useMemo(
    () => createStaffAdminClient(apiUrl, { accessToken, deviceId }),
    [apiUrl, accessToken, deviceId],
  );
  const [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [condition, setCondition] = useState('new'),
    [retail, setRetail] = useState(''),
    [start, setStart] = useState('500'),
    [category, setCategory] = useState(''),
    [location, setLocation] = useState(''),
    [launch, setLaunch] = useState(
      watInput(new Date(Date.now() + 3600000).toISOString()),
    ),
    [end, setEnd] = useState(
      watInput(new Date(Date.now() + 86400000).toISOString()),
    ),
    [draft, setDraft] = useState<{ id: string; updatedAt: string }>(),
    [categories, setCategories] = useState<{ id: string; name: string }[]>([]),
    [locations, setLocations] = useState<{ id: string; name: string }[]>([]),
    [photos, setPhotos] = useState<{ id: string; url: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    async function read() {
      const [c, l] = await Promise.all([
        client.categories({ limit: 50 }),
        client.locations({ limit: 50 }),
      ]);
      if (!active) return;
      setCategories(c.items);
      setLocations(l.items);
      setCategory(c.items[0]?.id ?? '');
      setLocation(l.items[0]?.id ?? '');
      if (row) {
        const v = await client.getDraft(row.id);
        if (!active) return;
        setName(v.title);
        setDescription(v.description);
        setCondition(v.condition);
        setRetail(String(v.retailPriceKobo / 100));
        setStart(String(v.startPriceKobo / 100));
        setCategory(v.categoryId);
        setLocation(v.locationId);
        setLaunch(watInput(v.startsAt));
        setEnd(watInput(v.endsAt));
        setDraft({ id: v.id, updatedAt: v.updatedAt });
        const loaded = await admin.photos(v.id);
        if (active)
          setPhotos(
            loaded.items.map((p) => ({
              id: p.id,
              url: p.thumbnailUrl ?? p.url,
            })),
          );
      }
    }
    void read().catch(() => {
      if (active)
        setError(
          'Draft setup could not be loaded. Close and reopen this form.',
        );
    });
    return () => {
      active = false;
    };
  }, [client, row?.id]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const value: CreateLotInput = {
        title: name,
        description,
        condition: condition as CreateLotInput['condition'],
        retailPriceKobo: parseNairaInput(retail) ?? 0,
        startPriceKobo: parseNairaInput(start) ?? 0,
        categoryId: category,
        locationId: location,
        startsAt: isoWat(launch),
        endsAt: isoWat(end),
      };
      const result = draft
        ? await client.editDraft(draft.id, {
            ...value,
            expectedUpdatedAt: draft.updatedAt,
          })
        : await admin.importDrafts({
            idempotencyKey: key.current,
            reason: 'Staff item intake',
            rows: [value],
          });
      const latest = await client.getDraft(result.id);
      setDraft({ id: latest.id, updatedAt: latest.updatedAt });
      setMessage(
        'Draft saved. Add actual item photos, then schedule the auction.',
      );
      onSaved();
    } catch {
      setError(
        'Draft could not be saved. Check the fields and connection; retry this same form before starting another.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!draft || !files) return;
    setBusy(true);
    setError('');
    try {
      const existing = await admin.photos(draft.id);
      let position =
        Math.max(-1, ...existing.items.map((p) => p.sortOrder)) + 1;
      for (const file of Array.from(files)) {
        if (
          file.size > 8 * 1024 * 1024 ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
        )
          throw Error();
        const hash = Array.from(
          new Uint8Array(
            await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
          ),
        )
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('');
        const prepared = await client.beginUpload(draft.id, {
          idempotencyKey: crypto.randomUUID(),
          contentType: file.type as 'image/jpeg',
          sizeBytes: file.size,
          sha256: hash,
          sortOrder: position,
        });
        const response = await fetch(prepared.uploadUrl, {
          method: 'PUT',
          headers: prepared.headers,
          body: file,
        });
        if (!response.ok) throw Error();
        const photo = await client.completeUpload(draft.id, prepared.uploadId);
        setPhotos((p) => [
          ...p,
          { id: photo.id, url: photo.thumbnailUrl ?? photo.url ?? '' },
        ]);
        position++;
      }
      setMessage('Item photos uploaded. Ready to schedule.');
      onSaved();
    } catch {
      setError(
        'Photo upload could not finish. Check that R2 image storage is configured, then retry with JPEG, PNG or WebP files up to 8 MB.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function schedule() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const latest = await client.getDraft(draft.id);
      await createPreBidClient(apiUrl, { accessToken, deviceId }).schedule(
        draft.id,
        {
          action: 'schedule',
          startsAt: isoWat(launch),
          endsAt: isoWat(end),
          expectedUpdatedAt: latest.updatedAt,
          idempotencyKey: crypto.randomUUID(),
          reason: 'Staff intake completed and checked',
        },
      );
      setMessage(
        'Auction scheduled. It will launch automatically at the selected time.',
      );
      setDraft(undefined);
      key.current = crypto.randomUUID();
      setName('');
      setDescription('');
      setRetail('');
      setStart('500');
      setPhotos([]);
      onSaved();
    } catch {
      setError(
        'Scheduling failed. Save the draft, add at least one photo and choose a future launch time before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="lv-staff-form">
      {error && <StaffMessage>{error}</StaffMessage>}
      {message && <StaffMessage tone="success">{message}</StaffMessage>}
      <form
        className="lv-staff-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          label="Item name"
          value={name}
          required
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
        />
        <label>
          Description and condition notes
          <textarea
            value={description}
            required
            maxLength={10000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="lv-staff-form-grid">
          <label>
            Condition
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              {databaseValues.lotConditions.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={category}
              required
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Retail estimate (NGN)"
            prefix="₦"
            inputMode="decimal"
            value={retail}
            onChange={(e) => setRetail(e.target.value.replace(/[^\d.]/g, ''))}
          />
          <Input
            label="Starting bid (NGN)"
            prefix="₦"
            inputMode="decimal"
            required
            value={start}
            onChange={(e) => setStart(e.target.value.replace(/[^\d.]/g, ''))}
          />
          <label>
            Pickup centre
            <select
              value={location}
              required
              onChange={(e) => setLocation(e.target.value)}
            >
              {locations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Goes live (WAT)"
            type="datetime-local"
            value={launch}
            required
            onChange={(e) => setLaunch(e.target.value)}
          />
          <Input
            label="Closes (WAT)"
            type="datetime-local"
            value={end}
            required
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <Button type="submit" busy={busy} disabled={!online}>
          {draft ? 'Save changes' : 'Save draft'}
        </Button>
      </form>
      {draft && (
        <section className="lv-staff-form">
          <h3>Actual item photos</h3>
          <p>
            Photograph all sides and any damage. Save photos before publishing.
          </p>
          <Input
            label="Take or upload item photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy || !online}
            onChange={(e) => void upload(e.target.files)}
          />
          <div className="lv-staff-row-actions">
            {photos.map((photo) => (
              <img
                key={photo.id}
                src={photo.url}
                alt="Uploaded item photo"
                width={80}
                height={80}
              />
            ))}
          </div>
          <Button
            variant="success"
            disabled={busy || !online}
            onClick={() => void schedule()}
          >
            Schedule auction
          </Button>
        </section>
      )}
    </div>
  );
}
export function InventoryCsv({
  apiUrl,
  accessToken,
  deviceId,
  online,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<CreateLotInput[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const key = useRef(crypto.randomUUID());
  function template() {
    const url = URL.createObjectURL(
      new Blob([STAFF_CSV_HEADERS.join(',') + '\n'], { type: 'text/csv' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lotvanta-intake.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="lv-staff-form">
      <p>
        Import up to 50 drafts. Prices in this CSV are integer kobo (₦500 =
        50000). Dates must include a time zone. Add photos before scheduling.
      </p>
      <Button variant="secondary" onClick={template}>
        Download CSV template
      </Button>
      {error && <StaffMessage>{error}</StaffMessage>}
      {message && <StaffMessage tone="success">{message}</StaffMessage>}
      <Input
        label="CSV file"
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 1_000_000) {
            setError('CSV must be smaller than 1 MB.');
            return;
          }
          void f
            .text()
            .then((text) => {
              setRows(parseStaffCsv(text));
              key.current = crypto.randomUUID();
              setError('');
            })
            .catch((cause) => {
              setRows([]);
              setError(
                cause instanceof Error ? cause.message : 'Check the CSV file.',
              );
            });
        }}
      />
      {rows.length > 0 && (
        <>
          <p>
            <strong>{rows.length} valid drafts</strong> ready to import.
          </p>
          <ul>
            {rows.slice(0, 5).map((r, i) => (
              <li key={i}>
                {r.title} · {r.condition.replaceAll('_', ' ')}
              </li>
            ))}
          </ul>
          <Button
            busy={busy}
            disabled={!online}
            onClick={() => {
              setBusy(true);
              setError('');
              void createStaffAdminClient(apiUrl, { accessToken, deviceId })
                .importDrafts({
                  idempotencyKey: key.current,
                  reason: 'Staff bulk CSV intake',
                  rows,
                })
                .then((result) => {
                  setMessage(result.message);
                  setRows([]);
                  onSaved();
                })
                .catch(() =>
                  setError(
                    'Import could not be confirmed. Retry this same file; it cannot create the batch twice.',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Import {rows.length} draft lots
          </Button>
        </>
      )}
    </div>
  );
}
