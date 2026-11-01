'use client';
import { useEffect, useState } from 'react';
import type {
  AuctionFeeSettings,
  AuctionFeeUpdate,
} from '@auction-ng/shared/auction-fee-schemas';
import { parseNairaInput } from '../presentation';
import { Button } from './button';
import { Input } from './input';
import { Toast } from './toast';
type Config = Omit<AuctionFeeUpdate, 'expectedRevision' | 'idempotencyKey'>;
export function AuctionFeePanel({
  snapshot,
  busy,
  disabled,
  error,
  success,
  onDismiss,
  onReload,
  onSave,
}: {
  snapshot?: AuctionFeeSettings;
  busy: boolean;
  disabled: boolean;
  error: string;
  success: string;
  onDismiss: () => void;
  onReload: () => void;
  onSave: (value: Config) => Promise<void>;
}) {
  const [service, setService] = useState(true),
    [lot, setLot] = useState(true),
    [vat, setVat] = useState(true),
    [serviceRate, setServiceRate] = useState(''),
    [lotAmount, setLotAmount] = useState(''),
    [vatRate, setVatRate] = useState(''),
    [reason, setReason] = useState('');
  useEffect(() => {
    if (snapshot) {
      const p = snapshot.policy;
      setService(p.serviceChargeEnabled);
      setLot(p.lotFeeEnabled);
      setVat(p.vatEnabled);
      setServiceRate(String(p.premiumBps / 100));
      setLotAmount(String(p.lotFeeKobo / 100));
      setVatRate(String(p.vatBps / 100));
      setReason('');
    }
  }, [snapshot]);
  const percent = (value: string) => {
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return undefined;
    const [whole, frac = ''] = value.split('.');
    const result = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
    return result <= 10000 ? result : undefined;
  };
  const premiumBps = percent(serviceRate),
    vatBps = percent(vatRate),
    lotFeeKobo = parseNairaInput(lotAmount);
  const valid =
    premiumBps !== undefined &&
    vatBps !== undefined &&
    lotFeeKobo !== undefined &&
    reason.trim().length >= 5;
  return (
    <section
      className="agn-wallet-controls-panel"
      aria-label="Auction fee settings"
    >
      <div className="agn-admin-heading">
        <div>
          <h2>Auction fees</h2>
          <p>Set the charges buyers see before bidding.</p>
        </div>
        <Button
          variant="secondary"
          size="small"
          disabled={busy || disabled}
          onClick={onReload}
        >
          Reload fee settings
        </Button>
      </div>
      <p className="agn-hint">
        Changes apply only to auctions with no accepted bids. The first accepted
        bid locks the fees through settlement. Buy Now tax stays separate.
      </p>
      {error && (
        <Toast tone="error" onClose={onDismiss}>
          {error}
        </Toast>
      )}
      {success && (
        <Toast tone="success" onClose={onDismiss}>
          {success}
        </Toast>
      )}
      {!snapshot ? (
        <p role="status">Loading auction fees…</p>
      ) : (
        <>
          {!snapshot.applied && (
            <Toast tone="error" onClose={onDismiss}>
              Saved fees have not been activated. Retry saving before accepting
              new bids at these rates.
            </Toast>
          )}
          <fieldset
            disabled={busy || disabled}
            className="agn-auction-fee-fields"
          >
            <label>
              <strong>Service charge</strong>
              <input
                aria-label="Enable service charge"
                type="checkbox"
                checked={service}
                onChange={(e) => setService(e.target.checked)}
              />
            </label>
            <Input
              label="Service charge (%)"
              inputMode="decimal"
              value={serviceRate}
              onChange={(e) => setServiceRate(e.target.value)}
              hint="0–100%, up to two decimal places"
            />
            <label>
              <strong>Lot fee</strong>
              <input
                aria-label="Enable lot fee"
                type="checkbox"
                checked={lot}
                onChange={(e) => setLot(e.target.checked)}
              />
            </label>
            <Input
              label="Lot fee (₦)"
              inputMode="decimal"
              value={lotAmount}
              onChange={(e) => setLotAmount(e.target.value)}
            />
            <label>
              <strong>VAT on fees</strong>
              <input
                aria-label="Enable VAT on fees"
                type="checkbox"
                checked={vat}
                onChange={(e) => setVat(e.target.checked)}
              />
            </label>
            <Input
              label="VAT on fees (%)"
              inputMode="decimal"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
            />
            <Input
              label="Reason for change"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </fieldset>
          <Button
            disabled={busy || !valid}
            onClick={() => {
              if (valid)
                void onSave({
                  serviceChargeEnabled: service,
                  premiumBps,
                  lotFeeEnabled: lot,
                  lotFeeKobo,
                  vatEnabled: vat,
                  vatBps,
                  reason,
                });
            }}
          >
            {busy
              ? 'Saving auction fees…'
              : disabled
                ? 'Retry fee update'
                : 'Save auction fees'}
          </Button>
        </>
      )}
    </section>
  );
}
