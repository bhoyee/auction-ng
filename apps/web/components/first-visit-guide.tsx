'use client';
import Image from 'next/image';
import { FirstVisitGuide as Guide } from '@auction-ng/ui/web/first-visit-guide';
import { useBuyer } from '../lib/session';

export function FirstVisitGuide({ demo }: { demo: boolean }) {
  const session = useBuyer();
  return session.ready && !session.tokens ? (
    <Guide
      demo={demo}
      images={[1, 2, 3].map((number) => (
        <Image
          key={number}
          src={`/banners/guide-${number}.png`}
          alt={
            number === 1
              ? 'Account signup, email verification and wallet funding illustration'
              : 'Owner-supplied guide artwork showing account setup and wallet funding'
          }
          width={1720}
          height={920}
          sizes="(max-width: 767px) calc(100vw - 72px), (max-width: 1100px) 30vw, 420px"
        />
      ))}
    />
  ) : null;
}
