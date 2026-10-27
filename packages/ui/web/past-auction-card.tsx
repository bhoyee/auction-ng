import { ImageOff } from 'lucide-react';
import { formatNaira } from '@auction-ng/shared/money';
import { productImageSource } from './demo-image';

export function PastAuctionCard({
  title,
  reference,
  priceKobo,
  endsAt,
  image,
}: {
  title: string;
  reference: string;
  priceKobo: number;
  endsAt: string;
  image?: string;
}) {
  return (
    <article className="agn-past-auction-card">
      <div className="agn-past-auction-image">
        {image ? (
          <img
            src={productImageSource(image)}
            alt={title}
            width={320}
            height={320}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <ImageOff size={32} aria-label="No photo available" />
        )}
        <span>Sold</span>
      </div>
      <div className="agn-past-auction-copy">
        <h2>{title}</h2>
        <p className="agn-past-auction-price">{formatNaira(priceKobo)}</p>
        <p>Final winning price</p>
        <p>
          Closed{' '}
          <time dateTime={endsAt}>
            {new Intl.DateTimeFormat('en-NG', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'Africa/Lagos',
            }).format(new Date(endsAt))}
          </time>
        </p>
        <small>{reference}</small>
      </div>
    </article>
  );
}
