import type { ReactNode } from 'react';
import { MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductPhoto } from './product-photo';
import { Button } from './button';
export function WatchlistLayout({ children }: { children: ReactNode }) {
  return <div className="agn-watchlist">{children}</div>;
}
export function WatchlistPagination({
  page,
  hasNext,
  onPrevious,
  onNext,
}: {
  page: number;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="agn-watch-pagination" aria-label="Watchlist pages">
      <p role="status">
        Page {page}
        <span>10 items per page</span>
      </p>
      <div>
        <Button variant="secondary" disabled={page <= 1} onClick={onPrevious}>
          <ChevronLeft size={18} aria-hidden="true" />
          Previous
        </Button>
        <Button variant="secondary" disabled={!hasNext} onClick={onNext}>
          Next
          <ChevronRight size={18} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
export function WatchlistCard({
  title,
  href,
  image,
  action,
  price,
  timer,
  locationName,
  locationAddress,
  children,
}: {
  title: string;
  href: string;
  image: string | null;
  action: ReactNode;
  price: ReactNode;
  timer: ReactNode;
  locationName: string;
  locationAddress: string;
  children?: ReactNode;
}) {
  return (
    <article className="agn-watch-card">
      <a
        className="agn-watch-card-image"
        href={href}
        aria-label={`View ${title}`}
      >
        <ProductPhoto src={image ?? undefined} alt={title} />
      </a>
      <div className="agn-watch-card-content">
        <div className="agn-watch-card-heading">
          <a href={href}>
            <h2>{title}</h2>
          </a>
          {action}
        </div>
        <div className="agn-watch-card-price">{price}</div>
        <div className="agn-watch-card-timer">{timer}</div>
        <section className="agn-watch-card-pickup" aria-label="Pickup location">
          <MapPin size={22} aria-hidden="true" />
          <div>
            <strong>{locationName}</strong>
            <p>{locationAddress}</p>
          </div>
        </section>
        {children && <div className="agn-watch-card-bid">{children}</div>}
      </div>
    </article>
  );
}
