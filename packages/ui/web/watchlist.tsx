import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { ProductPhoto } from './product-photo';
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
