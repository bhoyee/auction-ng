import type { ReactNode } from 'react';
import { ChevronDown, MapPin, Trophy } from 'lucide-react';
import type { databaseValues } from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import { retailDiscountPercent } from '../presentation';
import { Price, Countdown, ConditionBadge } from './auction';
export function LotInformationSection({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="agn-detail-information" open={open}>
      <summary>
        <h2>{title}</h2>
        <ChevronDown size={20} aria-hidden="true" />
      </summary>
      <div>{children}</div>
    </details>
  );
}
export function LotPriceSummary({
  priceKobo,
  retailKobo,
  condition,
  endsAt,
  serverNow,
  live,
}: {
  priceKobo: number;
  retailKobo: number;
  condition: (typeof databaseValues.lotConditions)[number];
  endsAt: number;
  serverNow: number;
  live: boolean;
}) {
  const discount = live
    ? retailDiscountPercent(priceKobo, retailKobo)
    : undefined;
  return (
    <div className="agn-detail-summary">
      <div className="agn-detail-price-row">
        <div className="agn-detail-price-group">
          {live ? (
            <Price kobo={priceKobo} label="Current price" />
          ) : (
            <span className="agn-detail-price-pending" role="status">
              Checking live price…
            </span>
          )}
          {live && retailKobo > priceKobo && (
            <div className="agn-detail-retail">
              {discount !== undefined && (
                <span
                  className="agn-detail-discount"
                  aria-label={`${discount}% below retail estimate`}
                >
                  −{discount}%
                </span>
              )}
              <s>{formatNaira(retailKobo)}</s>
              <small>Retail estimate</small>
            </div>
          )}
        </div>
        <ConditionBadge condition={condition} />
      </div>
      <Countdown
        endsAt={endsAt}
        serverNow={serverNow}
        live={live}
        showSeconds
        segmented
        detail
      />
    </div>
  );
}
export function LotAuctionPanel({ children }: { children: ReactNode }) {
  return (
    <section className="agn-detail-auction-panel" aria-label="Auction bidding">
      {children}
    </section>
  );
}
export function LotPanelHeader({
  itemId,
  actions,
}: {
  itemId: string;
  actions: ReactNode;
}) {
  return (
    <div className="agn-detail-toolbar">
      <p>
        <span>Item ID</span>
        <strong>{itemId}</strong>
      </p>
      <div className="agn-detail-actions">{actions}</div>
    </div>
  );
}
export function PickupLocationPanel({
  name,
  address,
}: {
  name: string;
  address?: string;
}) {
  return (
    <section className="agn-detail-pickup">
      <h2>Pickup location</h2>
      <div className="agn-detail-pickup-address">
        <span>
          <MapPin size={24} aria-hidden="true" />
        </span>
        <div>
          <h3>{name}</h3>
          <p>
            {address ||
              'Contact the warehouse to confirm the collection address.'}
          </p>
        </div>
      </div>
      <p className="agn-hint">Collect after payment with your pickup pass.</p>
    </section>
  );
}
export function InstantOfferBanner({
  priceKobo,
  endsAt,
  serverNow,
  live,
  action,
}: {
  priceKobo: number;
  endsAt: number;
  serverNow: number;
  live: boolean;
  action: ReactNode;
}) {
  return (
    <section
      className="agn-detail-instant-offer"
      aria-label="Instant win offer"
    >
      <div>
        <strong>{formatNaira(priceKobo)}</strong>
        <p>
          Offer expires:{' '}
          <Countdown
            endsAt={endsAt}
            serverNow={serverNow}
            live={live}
            showSeconds
          />
        </p>
      </div>
      <div className="agn-detail-instant-action">
        <Trophy size={22} aria-hidden="true" />
        {action}
      </div>
      <small>
        Fixed item price. Tax and any payment processing charge are shown before
        payment.
      </small>
    </section>
  );
}
