'use client';
import Image from 'next/image';
import { FirstVisitGuide as Guide } from '@auction-ng/ui/web/first-visit-guide';
import { useBuyer } from '../lib/session';

export function FirstVisitGuide({ demo }: { demo: boolean }) {
  const session = useBuyer();
  return session.ready && !session.tokens ? (
    <Guide
      demo={demo}
      images={[
        { width: 1706, height: 514 },
        { width: 1600, height: 769 },
        { width: 1600, height: 769 },
      ].map(({ width, height }, index) => (
        <Image
          key={index}
          src={`/banners/guide-${index + 1}-compact.webp`}
          alt={
            index === 0
              ? 'Account signup, email verification and wallet funding illustration'
              : 'Owner-supplied guide artwork showing account setup and wallet funding'
          }
          width={width}
          height={height}
          unoptimized
          sizes="(max-width: 767px) calc(100vw - 72px), (max-width: 1100px) 30vw, 420px"
        />
      ))}
    />
  ) : null;
}
