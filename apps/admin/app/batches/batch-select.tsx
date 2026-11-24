'use client';
import { useEffect, useState } from 'react';
import type { BatchPickerItem } from '@auction-ng/shared';
import type { BatchesClient } from '@auction-ng/api-client/batches';
import { Select } from '@auction-ng/ui/web/select';
import { openStaffPage } from './batches-area';
import { useBatchLoad } from './batch-ui';

/** Every open batch at a location (a few pages at most). */
async function openBatches(client: BatchesClient, locationId?: string) {
  const items: BatchPickerItem[] = [];
  let cursor: string | undefined;
  let lastUsedId: string | null = null;
  let canAdd = false;
  for (let page = 0; page < 10; page++) {
    const next = await client.picker({ locationId, cursor });
    items.push(...next.items);
    lastUsedId = next.lastUsedId;
    canAdd = next.canAdd;
    if (!next.nextCursor) break;
    cursor = next.nextCursor;
  }
  return { items, lastUsedId, canAdd };
}
const label = (b: BatchPickerItem) =>
  `${b.code} · ${b.name} · ${b.supplierName}`;

/**
 * The batch an item came from (required for new lots): open batches at the
 * chosen pickup location, and the lot's own batch even when it has closed.
 */
export function BatchSelect({
  client,
  locationId,
  value,
  preselect,
  disabled,
  error,
  onChange,
}: {
  client: BatchesClient;
  locationId: string;
  value: string | null;
  /** New lots start with the batch this person used last. */
  preselect: boolean;
  disabled?: boolean;
  error?: string;
  onChange: (id: string | null) => void;
}) {
  const read = useBatchLoad(
    () =>
      locationId
        ? openBatches(client, locationId)
        : Promise.resolve({ items: [], lastUsedId: null, canAdd: false }),
    [client, locationId],
  );
  const [own, setOwn] = useState<BatchPickerItem>();
  const data = read.data;
  const known = data?.items.some((b) => b.id === value);
  useEffect(() => {
    if (!value || known || !data) return;
    let active = true;
    void client
      .picker({ id: value })
      .then((r) => active && setOwn(r.items[0]))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, value, known, data]);
  useEffect(() => {
    if (preselect && !value && data?.lastUsedId) onChange(data.lastUsedId);
    // Only when a location's batches arrive.
  }, [data]);
  const empty = !!locationId && !!data && !data.items.length;
  return (
    <div>
      <Select
        label="Batch"
        value={value ?? ''}
        required
        disabled={disabled || !locationId}
        error={error}
        hint={
          !locationId
            ? 'Choose the pickup hub first.'
            : read.error
              ? 'Batches couldn’t be loaded. Check your connection.'
              : empty
                ? 'No open batch at this hub. Add the batch first, then the lot.'
                : 'The purchase this item came from.'
        }
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">
          {read.loading && !data ? 'Loading batches…' : 'Choose a batch'}
        </option>
        {own && own.id === value && !known && (
          <option value={own.id}>
            {label(own)}
            {own.status === 'closed' ? ' (closed)' : ''}
          </option>
        )}
        {data?.items.map((b) => (
          <option key={b.id} value={b.id}>
            {label(b)}
          </option>
        ))}
      </Select>
      {data?.canAdd && empty && (
        <p className="agn-hint">
          <button
            type="button"
            className="lv-setup-link"
            onClick={() => openStaffPage('batches', '/batches/new')}
          >
            Add batch
          </button>
        </p>
      )}
    </div>
  );
}

/** Any batch, for list filters and bulk changes. */
export function BatchFilter({
  client,
  value,
  label: title = 'Batch',
  any = 'Any batch',
  onChange,
}: {
  client: BatchesClient;
  value: string;
  label?: string;
  any?: string;
  onChange: (id: string) => void;
}) {
  const read = useBatchLoad(() => openBatches(client), [client]);
  const [own, setOwn] = useState<BatchPickerItem>();
  const known = read.data?.items.some((b) => b.id === value);
  useEffect(() => {
    if (!value || known || !read.data) return;
    void client
      .picker({ id: value })
      .then((r) => setOwn(r.items[0]))
      .catch(() => undefined);
  }, [client, value, known, read.data]);
  return (
    <Select
      label={title}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{any}</option>
      {own && own.id === value && !known && (
        <option value={own.id}>{label(own)}</option>
      )}
      {read.data?.items.map((b) => (
        <option key={b.id} value={b.id}>
          {label(b)}
        </option>
      ))}
    </Select>
  );
}
