import { notFound } from 'next/navigation';
import { buyerResourceIdSchema } from '@auction-ng/shared';
import { DealsListingPage } from '../../components/deals-listing-page';
import { BuyerPanel, BuyerStack, CategoryTile } from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerGrid } from '@auction-ng/ui/web/buyer-grids';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import {
  publicCategories,
  publicLocations,
  publicMarketplace,
} from '../../lib/catalogue';
import { publicSupportEmail, whatsappContact } from '../../lib/support';
import { HelpCentre } from '@auction-ng/ui/web/help-centre';
import { helpBlockText, helpSupport, helpTopics } from '../../lib/help-content';

export default async function BuyerRoute({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = await params;
  const [section, id] = path;
  if (section === 'categories' && !id) {
    const catalogue = await publicMarketplace();
    return (
      <BuyerPage title="Browse categories">
        <BuyerGrid>
          {catalogue.categories.length ? (
            catalogue.categories.map((category) => (
              <CategoryTile
                key={category.id}
                href={`/categories/${category.id}`}
                name={category.name}
                count={category.activeLotCount}
                image={
                  catalogue.items.find((lot) => lot.categoryId === category.id)
                    ?.thumbnail?.thumbnailUrl
                }
              />
            ))
          ) : (
            <EmptyState title="Categories are being prepared">
              Check back when the first auctions are published.
            </EmptyState>
          )}
        </BuyerGrid>
      </BuyerPage>
    );
  }
  if (
    ((section === 'ending-soon' || section === 'deals') && path.length === 1) ||
    (section === 'categories' &&
      id &&
      buyerResourceIdSchema.safeParse(id).success &&
      path.length === 2)
  ) {
    const query = await searchParams;
    const category =
      section === 'categories'
        ? (await publicCategories()).items.find((value) => value.id === id)
        : undefined;
    if (section === 'categories' && !category) notFound();
    return (
      <DealsListingPage
        section={section === 'ending-soon' ? 'ending-soon' : 'all'}
        title={
          category?.name ?? (section === 'deals' ? 'All Deals' : 'Ending Soon')
        }
        categoryId={section === 'categories' ? id : undefined}
        params={query}
      />
    );
  }
  if (section === 'locations' && path.length === 1) {
    const locations = await publicLocations();
    return (
      <BuyerPage
        narrow
        title="Pickup locations"
        description="Each lot identifies its pickup warehouse. Confirm the location before you bid."
      >
        <BuyerStack>
          {locations.items.length ? (
            locations.items.map((location) => (
              <BuyerPanel key={location.id}>
                <h2>{location.name}</h2>
                <p>
                  Use your paid invoice and private pickup pass when collecting.
                  Confirm opening hours with the warehouse before travelling.
                </p>
              </BuyerPanel>
            ))
          ) : (
            <EmptyState title="Pickup locations are being prepared">
              Location details will be published alongside auctions.
            </EmptyState>
          )}
        </BuyerStack>
      </BuyerPage>
    );
  }
  if (section === 'help' && path.length === 1) {
    const faq = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: helpTopics.flatMap((topic) =>
        topic.questions.map((question) => ({
          '@type': 'Question',
          name: question.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: question.answer.map(helpBlockText).join(' '),
          },
        })),
      ),
    };
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faq).replace(/</g, '\\u003c'),
          }}
        />
        <HelpCentre
          topics={helpTopics}
          contact={{
            ...helpSupport,
            whatsappHref: whatsappContact(process.env.SUPPORT_WHATSAPP_NUMBER),
            email: publicSupportEmail(),
          }}
        />
      </>
    );
  }
  notFound();
}
