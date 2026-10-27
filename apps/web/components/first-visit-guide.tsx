'use client';
import { FirstVisitGuide as Guide } from '@auction-ng/ui/web/first-visit-guide';
import images from '../lib/guide-images.generated.json';
import { useBuyer } from '../lib/session';

const descriptions = [
  'Sign Up & Top. Create your account, verify your email and fund your wallet by card or bank transfer.',
  'Bid & Win. Check the condition notes and full cost. Choose your bid and follow the auction to the finish.',
  'Pick Up & Repeat. Follow the pickup instructions and collect your winning lot with your pickup pass. Then find your next favourite.',
];
const sizes =
  '(max-width: 767px) calc(100vw - 32px), (max-width: 1100px) calc((100vw - 80px) / 3), (max-width: 1464px) calc((100vw - 96px) / 3), 456px';
export function FirstVisitGuide() {
  const session = useBuyer();
  return session.ready && !session.tokens ? (
    <Guide
      images={images.map((image, index) => (
        <picture key={image.src}>
          <source type="image/avif" srcSet={image.avifSrcSet} sizes={sizes} />
          <img
            src={image.src}
            srcSet={image.webpSrcSet}
            sizes={sizes}
            width={image.width}
            height={image.height}
            alt={descriptions[index]}
            loading="lazy"
            decoding="async"
          />
        </picture>
      ))}
    />
  ) : null;
}
