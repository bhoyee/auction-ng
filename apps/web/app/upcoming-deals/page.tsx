import { cataloguePageSchema } from '@auction-ng/shared/catalogue-schemas';
import { UpcomingDeals } from '../../components/upcoming-deals';
export default async function Page() {
  let initial;
  try {
    const response = await fetch(
      new URL(
        '/upcoming-lots?limit=24',
        process.env.API_INTERNAL_URL ??
          process.env.NEXT_PUBLIC_API_URL ??
          'http://localhost:4000',
      ),
      { cache: 'no-store', signal: AbortSignal.timeout(10000) },
    );
    if (response.ok) initial = cataloguePageSchema.parse(await response.json());
  } catch {
    /* The client keeps the retry action available. */
  }
  return <UpcomingDeals initial={initial} />;
}
