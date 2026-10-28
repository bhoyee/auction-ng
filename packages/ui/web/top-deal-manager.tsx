'use client';
import { useState } from 'react';
import type { CatalogueLot } from '@auction-ng/shared/catalogue-schemas';
import { merchandisingRules, unsoldRelistRules } from '@auction-ng/shared';
import { Button } from './button';
import { Input } from './input';
import { FixedPriceEditor } from './fixed-price-editor';
export type TopDealRow = CatalogueLot & {
  updatedAt: string;
  autoRelistEnabled: boolean;
  autoRelistCount: number;
};
function RelistControl({
  lot,
  disabled,
  onSave,
}: {
  lot: TopDealRow;
  disabled: boolean;
  onSave: (lot: TopDealRow, enabled: boolean) => Promise<string | undefined>;
}) {
  const [enabled, setEnabled] = useState(lot.autoRelistEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const terminal = lot.status === 'closed' || lot.status === 'cancelled';
  return (
    <form
      className="agn-admin-relist"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
          setError((await onSave(lot, enabled)) ?? '');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="agn-consent">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled || busy || terminal}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Auto-relist if no bids
      </label>
      <p>
        24 hours per retry · {lot.autoRelistCount} of{' '}
        {unsoldRelistRules.maxRetries} retries used. Condition and photos stay
        unchanged.
      </p>
      <Button
        type="submit"
        variant="secondary"
        busy={busy}
        disabled={disabled || terminal || enabled === lot.autoRelistEnabled}
      >
        Save relisting
      </Button>
      {error && (
        <p role="alert" className="agn-field-error">
          {error}
        </p>
      )}
    </form>
  );
}
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
  onRelist,
  onFixedPrice,
}: {
  lots: TopDealRow[];
  onFixedPrice: (
    lot: TopDealRow,
    price: number | null,
  ) => Promise<string | undefined>;
  onRelist: (lot: TopDealRow, enabled: boolean) => Promise<string | undefined>;
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
        <div key={`${lot.id}:${lot.updatedAt}`}>
          <LotEditor
            key={`${lot.id}:${lot.updatedAt}`}
            lot={lot}
            disabled={disabled}
            onSave={onSave}
          />
          <RelistControl lot={lot} disabled={disabled} onSave={onRelist} />
          <FixedPriceEditor
            lot={lot}
            disabled={disabled}
            onSave={onFixedPrice}
          />
        </div>
      ))}
    </div>
  );
}
