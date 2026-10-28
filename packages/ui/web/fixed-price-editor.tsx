'use client';
import { useState } from 'react';
import { parseNairaInput } from '../presentation';
import type { TopDealRow } from './top-deal-manager';
import { Input } from './input';
import { Button } from './button';
export function FixedPriceEditor({
  lot,
  disabled,
  onSave,
}: {
  lot: TopDealRow;
  disabled: boolean;
  onSave: (
    lot: TopDealRow,
    price: number | null,
  ) => Promise<string | undefined>;
}) {
  const [price, setPrice] = useState(
    lot.fixedPriceKobo === null ? '' : String(lot.fixedPriceKobo / 100),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kobo = price.trim() === '' ? null : parseNairaInput(price);
  return (
    <form
      className="agn-admin-relist"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        if (kobo === undefined || kobo === 0) {
          setError(
            'Enter a positive Naira price or leave it empty to disable.',
          );
          return;
        }
        setBusy(true);
        try {
          setError((await onSave(lot, kobo)) ?? '');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input
        label="Fixed purchase price (₦)"
        inputMode="decimal"
        value={price}
        disabled={
          disabled ||
          busy ||
          lot.status === 'closed' ||
          lot.status === 'cancelled'
        }
        onChange={(event) => setPrice(event.target.value)}
        hint="Optional. Leave empty to remove. Buyers pay this price plus 7.5% tax; no buyer premium or lot fee."
      />
      <Button
        type="submit"
        variant="secondary"
        busy={busy}
        disabled={
          disabled ||
          lot.status === 'closed' ||
          lot.status === 'cancelled' ||
          kobo === lot.fixedPriceKobo
        }
      >
        Save fixed price
      </Button>
      {error && (
        <p role="alert" className="agn-field-error">
          {error}
        </p>
      )}
    </form>
  );
}
