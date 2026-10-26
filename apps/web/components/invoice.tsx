'use client';
import { useCallback, useEffect, useState } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { readPickupPass } from '@auction-ng/api-client/closing';
import { formatNaira } from '@auction-ng/shared/money';
import { Badge } from '@auction-ng/ui/web/auction';
import {
  BuyerLink,
  BuyerPanel,
  BuyerStack,
  BuyerSkeleton,
  MoneyLine,
} from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { apiUrl, useBuyer } from '../lib/session';
import { usePrivateRead } from '../lib/private-read';

export function Invoice({ id, pass = false }: { id: string; pass?: boolean }) {
  const read = useCallback(
    (credentials: { accessToken: string; deviceId: string }) =>
      createBuyerClient(apiUrl, credentials).invoice(id),
    [id],
  );
  const { data, error, reload } = usePrivateRead(read);
  return (
    <BuyerPage
      narrow
      title={pass ? 'Your pickup pass' : (data?.number ?? 'Invoice')}
    >
      {error ? (
        <ErrorState title="Invoice unavailable" onRetry={reload}>
          Sign in with the account that owns this invoice, or try again.
        </ErrorState>
      ) : !data ? (
        <BuyerSkeleton />
      ) : (
        <BuyerStack>
          <BuyerPanel>
            <Badge tone={data.status === 'paid' ? 'win' : 'neutral'}>
              {data.status}
            </Badge>
            {data.lines.map((line) => (
              <MoneyLine
                key={line.lot.id}
                label={`${line.lot.lotNumber} · ${line.lot.title}`}
                value={formatNaira(line.totalKobo)}
              />
            ))}
            <MoneyLine
              label="Hammer total"
              value={formatNaira(data.hammerTotalKobo)}
            />
            <MoneyLine
              label="Buyer premium"
              value={formatNaira(data.premiumKobo)}
            />
            <MoneyLine label="Lot fees" value={formatNaira(data.lotFeeKobo)} />
            <MoneyLine label="VAT on fees" value={formatNaira(data.vatKobo)} />
            <MoneyLine
              label="Total"
              value={formatNaira(data.totalKobo)}
              total
            />
            {data.pickup && (
              <p>
                Pickup: {data.pickup.location} · {data.pickup.status}
              </p>
            )}
            {data.status === 'paid' && !pass && (
              <BuyerLink href={`/invoices/${id}/pickup-pass`}>
                Open pickup pass
              </BuyerLink>
            )}
          </BuyerPanel>
          {pass &&
            (data.status === 'paid' ? (
              <PickupCode id={id} />
            ) : (
              <EmptyState title="Payment is required before pickup">
                Your pass appears after payment is confirmed.
              </EmptyState>
            ))}
        </BuyerStack>
      )}
    </BuyerPage>
  );
}
function PickupCode({ id }: { id: string }) {
  const { tokens, deviceId } = useBuyer();
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setImage('');
    setError(false);
    if (tokens)
      void readPickupPass(apiUrl, id, tokens.accessToken, deviceId)
        .then(async (result) => {
          const qr = await import('qrcode');
          const value = await qr.toDataURL(result.token, {
            errorCorrectionLevel: 'M',
            width: 640,
            margin: 4,
          });
          if (active) setImage(value);
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [tokens, deviceId, id, version]);
  return (
    <BuyerPanel>
      <h2>Show this at the pickup desk</h2>
      <p>
        Keep this pass private. Anyone with it may be able to collect your
        order.
      </p>
      {error ? (
        <ErrorState onRetry={() => setVersion((value) => value + 1)} />
      ) : image ? (
        <img
          className="agn-buyer-qr"
          src={image}
          width={320}
          height={320}
          alt="Private pickup QR code"
        />
      ) : (
        <p role="status">Loading your private pickup code…</p>
      )}
    </BuyerPanel>
  );
}
