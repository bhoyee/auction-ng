import { COLLECTION_POLICY, databaseValues } from '@auction-ng/shared';
import {
  DEFAULT_FEE_RULES,
  FIXED_PRICE_TAX_BPS,
} from '@auction-ng/shared/fees';
import { formatNaira } from '@auction-ng/shared/money';
import { ConditionBadge } from './auction';

const percent = (bps: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(bps / 10000);
export function AuctionPolicies({
  startPriceKobo,
  fixedPriceAvailable,
}: {
  startPriceKobo: number;
  fixedPriceAvailable: boolean;
}) {
  return (
    <div className="agn-auction-policies">
      <dl>
        <div>
          <dt>Starting price</dt>
          <dd>
            This item starts at {formatNaira(startPriceKobo)}. All bids and
            payments are in Nigerian Naira. Check the live price and minimum
            next bid before bidding.
          </dd>
        </div>
        <div>
          <dt>Item condition</dt>
          <dd>
            <div className="agn-auction-policy-grades">
              {databaseValues.lotConditions.map((condition) => (
                <ConditionBadge key={condition} condition={condition} />
              ))}
            </div>
            Use the condition assigned to this item and read its photos and
            description. Open-box or untested does not mean fully functional.
            See the <a href="/help#condition-grades">condition grades</a> and{' '}
            <a href="/terms-of-use">Terms of Use</a>.
          </dd>
        </div>
        <div>
          <dt>Inspection before collection</dt>
          <dd>
            Do not assume that every item has been tested for full
            functionality. {COLLECTION_POLICY.inspection}
          </dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>
            Auction bids require sufficient available wallet funds. The required
            amount is held when your bid is accepted; a confirmed winning bid is
            paid from your wallet.{' '}
            {fixedPriceAvailable &&
              'Buy Now can be paid from your wallet, by card or by bank transfer through the checkout.'}
          </dd>
        </div>
        <div>
          <dt>Auction fees</dt>
          <dd>
            Winning auction bids include a{' '}
            {percent(DEFAULT_FEE_RULES.premiumBps)} buyer premium and a{' '}
            {formatNaira(DEFAULT_FEE_RULES.lotFeeKobo)} lot fee, plus{' '}
            {percent(DEFAULT_FEE_RULES.vatBps)} VAT on those fees. Review the
            total before confirming your bid.
          </dd>
        </div>
        {fixedPriceAvailable && (
          <div>
            <dt>Buy Now fees</dt>
            <dd>
              The fixed item price has {percent(FIXED_PRICE_TAX_BPS)} tax added
              at checkout. No auction buyer premium or lot fee applies.
            </dd>
          </div>
        )}
        <div>
          <dt>Processing charges</dt>
          <dd>
            The buyer covers applicable card or transfer processing charges.
            These are shown before payment.
          </dd>
        </div>
        <div>
          <dt>If you win</dt>
          <dd>
            Bring your pickup pass and order reference to the collection centre
            shown above, after payment is confirmed. Check the centre’s opening
            hours and your collection instructions before travelling.
            Collection-centre transfers and delivery are not currently offered.
          </dd>
        </div>
      </dl>
      <div className="agn-auction-policy-returns">
        <h3>Check before you leave — no returns after collection</h3>
        <p>{COLLECTION_POLICY.returns}</p>
        <p>{COLLECTION_POLICY.inspection}</p>
      </div>
      <p className="agn-auction-policy-note">{COLLECTION_POLICY.rights}</p>
    </div>
  );
}
