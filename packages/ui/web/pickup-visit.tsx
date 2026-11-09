import type { ReactNode } from 'react';
import {
  MapPin,
  ShieldCheck,
  ScanLine,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import type { PickupVisitPass } from '@auction-ng/shared/pickup-visit-schemas';
export function PickupPassCard({
  pass,
  image,
  expired,
  children,
}: {
  pass: PickupVisitPass;
  image?: string;
  expired: boolean;
  children: ReactNode;
}) {
  const status = pass.visit?.status;
  return (
    <section className="agn-visit-pass" aria-label="Your check-in pass">
      <div className="agn-visit-pass-main">
        <div className="agn-visit-pass-heading">
          <ScanLine size={24} aria-hidden="true" />
          <h2>Your check-in pass</h2>
        </div>
        {!status ? (
          <>
            <p>
              Show this at the collection desk. One scan checks you in for this
              centre.
            </p>
            <div
              className={`agn-visit-qr${expired ? ' agn-visit-qr--expired' : ''}`}
            >
              {!expired && image ? (
                <img
                  src={image}
                  width={240}
                  height={240}
                  alt="Private check-in QR code"
                />
              ) : (
                <span>
                  {expired ? 'Pass expired' : 'Preparing your QR code…'}
                </span>
              )}
            </div>
            {!expired && (
              <>
                <span className="agn-visit-code-label">
                  Or give staff this code
                </span>
                <strong className="agn-visit-code">
                  {pass.code.slice(0, 4)} {pass.code.slice(4)}
                </strong>
                <span className="agn-visit-expiry">
                  Valid until{' '}
                  {new Date(pass.expiresAt).toLocaleTimeString('en-NG', {
                    timeZone: 'Africa/Lagos',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  WAT
                </span>
              </>
            )}
          </>
        ) : (
          <div className={`agn-visit-outcome agn-visit-outcome--${status}`}>
            <CheckCircle2 size={48} aria-hidden="true" />
            <h3>
              {status === 'waiting'
                ? "You're checked in"
                : status === 'completed'
                  ? 'Collection confirmed'
                  : 'Visit cancelled'}
            </h3>
            <p>
              {status === 'waiting'
                ? 'Warehouse staff can see your arrival. Keep this page open while they assist you.'
                : status === 'completed'
                  ? 'Your collected items have been recorded. Any items not collected remain in Awaiting pickup.'
                  : 'No items were marked collected by cancelling this visit.'}
            </p>
            {status === 'waiting' && (
              <span>
                <Clock3 size={16} aria-hidden="true" />
                Waiting for collection
              </span>
            )}
          </div>
        )}
        {children}
      </div>
      <aside className="agn-visit-pass-info">
        <MapPin size={24} aria-hidden="true" />
        <h3>{pass.location.name}</h3>
        <p>{pass.location.address}</p>
        <div>
          <ShieldCheck size={20} aria-hidden="true" />
          <p>
            Keep your pass private. Staff verify your paid items before
            handover.
          </p>
        </div>
        <a href="/awaiting-pickup">View awaiting pickup</a>
      </aside>
    </section>
  );
}
export function PickupDeskPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="agn-visit-desk-panel" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
