import { DealsListingPage } from '../../components/deals-listing-page';
export const metadata = { title: 'Top Deals | GiddyDeal' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <DealsListingPage
      section="top-deals"
      title="Top Deals"
      params={await searchParams}
    />
  );
}
