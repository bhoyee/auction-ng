'use client';
import { useState } from 'react';
import type { CatalogueLot } from '@auction-ng/shared/catalogue-schemas';
import { merchandisingRules } from '@auction-ng/shared';
import { Button } from './button';
import { Input } from './input';
export type TopDealRow = CatalogueLot & { updatedAt: string };
function LotEditor({
  lot,
  disabled,
  onSave,
}: {
  lot: TopDealRow;
  disabled: boolean;
  onSave: (
    lot: TopDealRow,
    featured: boolean,
    order: number,
  ) => Promise<string | undefined>;
}) {
  const [featured, setFeatured] = useState(lot.isTopDeal);
  const [order, setOrder] = useState(String(lot.topDealOrder));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const terminal = lot.status === 'closed' || lot.status === 'cancelled';
  return (
    <form
      className="agn-admin-lot-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        setBusy(true);
        try {
          setError((await onSave(lot, featured, Number(order))) ?? '');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="agn-admin-lot-summary">
        <h2>{lot.title}</h2>
        <p>
          {lot.lotNumber} <span>{lot.status}</span>
        </p>
        <p>
          {terminal
            ? 'This auction has ended. You can remove its featured selection.'
            : 'Only active lots appear. Final 20 minutes move to Closing now.'}
        </p>
      </div>
      <label className="agn-consent">
        <input
          type="checkbox"
          checked={featured}
          disabled={disabled || busy || (terminal && !lot.isTopDeal)}
          onChange={(event) => setFeatured(event.target.checked)}
        />
        Feature in Top Deals
      </label>
      <Input
        label="Display order"
        type="number"
        min={0}
        max={merchandisingRules.maxOrder}
        step={1}
        required
        value={order}
        disabled={disabled || busy}
        onChange={(event) => setOrder(event.target.value)}
        hint="Lower numbers appear first."
      />
      <Button
        type="submit"
        busy={busy}
        disabled={
          disabled ||
          (featured === lot.isTopDeal && Number(order) === lot.topDealOrder)
        }
      >
        Save selection
      </Button>
      {error && (
        <p className="agn-field-error agn-admin-row-message" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
export function TopDealManager({
  lots,
  disabled,
  onSave,
}: {
  lots: TopDealRow[];
  disabled: boolean;
  onSave: (
    lot: TopDealRow,
    featured: boolean,
    order: number,
  ) => Promise<string | undefined>;
}) {
  return (
    <div className="agn-admin-lot-list">
      {lots.map((lot) => (
        <LotEditor
          key={`${lot.id}:${lot.updatedAt}`}
          lot={lot}
          disabled={disabled}
          onSave={onSave}
        />
      ))}
    </div>
  );
}
