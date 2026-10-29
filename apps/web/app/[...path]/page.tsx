import { notFound } from 'next/navigation';
import { buyerResourceIdSchema, COLLECTION_POLICY } from '@auction-ng/shared';
import { DealsListingPage } from '../../components/deals-listing-page';
import {
  BuyerLink,
  BuyerPanel,
  BuyerStack,
  CategoryTile,
} from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerGrid } from '@auction-ng/ui/web/buyer-grids';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import {
  publicCategories,
  publicLocations,
  publicMarketplace,
} from '../../lib/catalogue';
import { whatsappContact } from '../../lib/support';

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
    const whatsappHref = whatsappContact(process.env.SUPPORT_WHATSAPP_NUMBER);
    return (
      <BuyerPage
        narrow
        title="Help centre"
        description="Bidding, payments and collecting your wins."
      >
        <BuyerStack>
          <BuyerPanel>
            <h2>Fund your wallet</h2>
            <p>
              Pay by card or bank transfer. The Paystack processing fee and the
              net wallet credit are shown before payment. A funded wallet and
              verified email are required to bid.
            </p>
          </BuyerPanel>
          <section id="faqs" className="agn-buyer-panel agn-help-section">
            <h2>Frequently asked questions</h2>
            <details>
              <summary>Do I need money in my wallet to bid?</summary>
              <p>
                Yes. Your available balance must cover your bid and the
                estimated auction fees. The full total is shown before you
                confirm.
              </p>
            </details>
            <details>
              <summary>What happens if someone outbids me?</summary>
              <p>
                Your reservation is released back to your available wallet
                balance. You can use those funds for another bid.
              </p>
            </details>
            <details>
              <summary>Why did the closing time change?</summary>
              <p>
                An accepted bid in the final two minutes extends the auction to
                give other buyers time to respond.
              </p>
            </details>
            <details>
              <summary>Where do I collect my item?</summary>
              <p>
                Check the pickup location on the lot before bidding. After a
                confirmed paid win, your invoice and private pickup pass contain
                the collection details.
              </p>
            </details>
          </section>
          <section id="contact" className="agn-buyer-panel agn-help-section">
            <h2>Contact us</h2>
            <p>
              Have your lot or invoice reference ready so we can identify the
              auction you need help with. Never share your sign-in code or
              private pickup QR code.
            </p>
            {whatsappHref ? (
              <BuyerLink href={whatsappHref}>Contact us on WhatsApp</BuyerLink>
            ) : (
              <p>
                Support contact details will be published before real auctions
                launch.
              </p>
            )}
          </section>
          <section id="returns" className="agn-buyer-panel agn-help-section">
            <h2>Returns &amp; refunds</h2>
            <p>{COLLECTION_POLICY.inspection}</p>
            <p>{COLLECTION_POLICY.returns}</p>
            <p>{COLLECTION_POLICY.rights}</p>
            <p>
              For a question about an existing win, keep your invoice reference
              and <a href="/help#contact">contact support</a>.
            </p>
          </section>
          <section
            id="condition-grades"
            className="agn-buyer-panel agn-help-section"
          >
            <h2>Condition grades</h2>
            <p>
              Check each lot's condition grade, photos and inspection notes
              before bidding. A grade does not replace the individual lot
              description.
            </p>
            <a href="/search">Browse lots and their condition notes</a>
          </section>
          <section id="bidding" className="agn-buyer-panel agn-help-section">
            <h2>Choose how to bid</h2>
            <p>
              Direct bidding is the default: the full amount becomes the price
              if you lead. Choose an automatic spending limit only if you want
              us to bid up to your private maximum. Both reserve enough wallet
              funds for the bid and auction fees.
            </p>
          </section>
          <BuyerPanel>
            <h2>Review the total and collect your win</h2>
            <p>
              Review the hammer price, buyer premium, lot fee and VAT before
              confirming. Being outbid releases your reservation. A late bid
              extends the closing time. A confirmed paid win gives you an
              invoice and private QR pickup pass.
            </p>
          </BuyerPanel>
        </BuyerStack>
      </BuyerPage>
    );
  }
  notFound();
}
