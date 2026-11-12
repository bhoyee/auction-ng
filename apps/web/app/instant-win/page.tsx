import { DealsListingPage } from '../../components/deals-listing-page';
export const metadata = { title: 'Instant Win | LotVanta' };
// Live lots that offer Buy Now at a fixed price.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <DealsListingPage
      section="instant-win"
      title="Instant Win"
      params={await searchParams}
    />
  );
}
