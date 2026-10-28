'use client';
import type { ReactNode } from 'react';
import { Clock3, Crown, RefreshCw } from 'lucide-react';
import { formatNaira } from '@auction-ng/shared/money';
import { Button } from './button';
export type HistoryRow = {
  id: string;
  bidder: string;
  amountKobo: number;
  createdAt: string;
  automatic?: boolean;
};
export function BidHistoryPanel({
  personal,
  signedIn,
  onView,
  refresh,
  loading,
  children,
}: {
  personal: boolean;
  signedIn: boolean;
  onView: (personal: boolean) => void;
  refresh: () => void;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <section className="agn-bid-history" aria-label="Bid history">
      <h2>
        <Clock3 size={24} aria-hidden="true" />
        Bid History
      </h2>
      <div className="agn-bid-history-controls">
        <div role="group" aria-label="Bid history view">
          <Button
            variant={!personal ? 'primary' : 'secondary'}
            aria-pressed={!personal}
            onClick={() => onView(false)}
          >
            Winning Bid
          </Button>
          <Button
            variant={personal ? 'primary' : 'secondary'}
            aria-pressed={personal}
            disabled={!signedIn}
            title={!signedIn ? 'Sign in to see your bids' : undefined}
            onClick={() => onView(true)}
          >
            Your Bid
          </Button>
        </div>
        <Button
          variant="secondary"
          aria-label="Refresh bid history"
          title="Refresh bid history"
          busy={loading}
          onClick={refresh}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </Button>
      </div>
      {!signedIn && (
        <p className="agn-bid-history-note">
          Sign in to view your own bids. Public history is available to
          everyone.
        </p>
      )}
      {children}
      <p className="agn-bid-history-note">
        Recorded leading prices can take a moment to appear. The live price
        above is current. Private spending limits are never shown publicly. All
        times are WAT.
      </p>
    </section>
  );
}
export function BidHistoryTable({
  rows,
  personal,
  newest,
}: {
  rows: HistoryRow[];
  personal: boolean;
  newest: boolean;
}) {
  return (
    <div className="agn-bid-history-scroll">
      <table>
        <caption className="agn-sr-only">
          {personal
            ? 'Your bids on this item'
            : 'Recorded leading bids, newest first'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Bidder</th>
            <th scope="col">Amount</th>
            <th scope="col">Date</th>
            <th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              className={
                !personal && newest && index === 0
                  ? 'agn-bid-history-leading'
                  : undefined
              }
            >
              <td>
                <span>
                  {row.bidder}
                  {!personal && newest && index === 0 && (
                    <Crown size={18} aria-label="Latest recorded leader" />
                  )}
                </span>
                {personal && row.automatic && <small>Automatic bid</small>}
              </td>
              <td>{formatNaira(row.amountKobo)}</td>
              <td>
                <time dateTime={row.createdAt}>
                  {new Date(row.createdAt).toLocaleDateString('en-NG', {
                    timeZone: 'Africa/Lagos',
                    day: 'numeric',
                    month: 'short',
                  })}
                </time>
              </td>
              <td>
                {new Date(row.createdAt).toLocaleTimeString('en-NG', {
                  timeZone: 'Africa/Lagos',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
