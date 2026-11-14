import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { buyerResourceIdSchema } from '@auction-ng/shared/buyer-schemas';
import { formatNaira } from '@auction-ng/shared/money';
import { lotPath, parseLotPath } from '@auction-ng/shared';
import { findPublicLot, publicLots } from '../../../lib/catalogue';
import { LotDetail } from '../../../components/lot-detail';
import { catalogueCards } from '../../../components/catalogue-grid';

/**
 * Readable addresses (2026-11-14): /lots/<product-name>-lot-<code>. Old
 * /lots/<uuid> links and renamed lots redirect permanently to the current
 * address, so emails and bookmarks keep working.
 */
const resolve = cache(async (segment: string) => {
  const lotNumber = parseLotPath(segment);
  const lot = lotNumber
    ? await findPublicLot({ lotNumber })
    : buyerResourceIdSchema.safeParse(segment).success
      ? await findPublicLot({ id: segment })
      : null;
  if (!lot) notFound();
  return { lot, path: lotPath(lot) };
});

const siteUrl = (
  process.env.NEXT_PUBLIC_BUYER_URL ?? 'http://localhost:3300'
).replace(/\/$/, '');

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { lot, path } = await resolve(decodeURIComponent(id));
  const description = `${lot.title}. Bidding starts at ${formatNaira(lot.startPriceKobo)} (retail estimate ${formatNaira(lot.retailPriceKobo)}). Collect from ${lot.location.name}.`;
  const image = lot.images[0]?.url;
  return {
    title: `${lot.title} · LotVanta`,
    description,
    alternates: { canonical: siteUrl + path },
    openGraph: {
      title: lot.title,
      description,
      url: siteUrl + path,
      type: 'website',
      ...(image && /^https?:/.test(image) ? { images: [{ url: image }] } : {}),
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { lot, path } = await resolve(decodeURIComponent(id));
  if (`/lots/${decodeURIComponent(id)}` !== path) permanentRedirect(path);
  const similar = await publicLots({
    categoryId: lot.categoryId,
    limit: 8,
  }).catch(() => null);
  return (
    <LotDetail
      lot={{
        id: lot.id,
        status: lot.status,
        title: lot.title,
        lotNumber: lot.lotNumber,
        description: lot.description,
        condition: lot.condition,
        startPriceKobo: lot.startPriceKobo,
        retailPriceKobo: lot.retailPriceKobo,
        endsAt: lot.endsAt,
        startsAt: lot.startsAt,
        comingSoon: lot.comingSoon,
        included: lot.included,
        defects: lot.defects,
        brand: lot.brand,
        details: lot.details,
        bidCount: lot.bidCount,
        fixedPriceKobo: lot.fixedPriceKobo,
        category: { id: lot.category.id, name: lot.category.name },
        location: { name: lot.location.name, address: lot.location.address },
        images: lot.images.map(({ url, thumbnailUrl }) => ({
          url,
          thumbnailUrl,
        })),
      }}
      similar={catalogueCards(
        similar?.items.filter((item) => item.id !== lot.id).slice(0, 6) ?? [],
      )}
      serverTime={similar?.serverTime}
    />
  );
}
