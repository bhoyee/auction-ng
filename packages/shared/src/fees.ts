import { addKobo, assertKobo, fromLedgerKobo, toLedgerKobo } from './money';

export type FeeRules = Readonly<{
  premiumBps: number;
  lotFeeKobo: number;
  vatBps: number;
}>;
// VAT is provisional and must be confirmed by the business owner before launch.
export const DEFAULT_FEE_RULES: FeeRules = Object.freeze({
  premiumBps: 1500,
  lotFeeKobo: 30000,
  vatBps: 750,
});

function rate(amount: number, bps: number): number {
  assertKobo(bps);
  if (bps > 10000)
    throw new RangeError('Basis points must be between zero and 10000.');
  // Integer intermediates avoid both binary floating point and unsafe products.
  return fromLedgerKobo((toLedgerKobo(amount) * BigInt(bps) + 5000n) / 10000n);
}

export function calculateInvoiceLine(
  hammerKobo: number,
  rules = DEFAULT_FEE_RULES,
) {
  assertKobo(hammerKobo);
  assertKobo(rules.lotFeeKobo);
  const premiumKobo = rate(hammerKobo, rules.premiumBps);
  const vatKobo = rate(addKobo(premiumKobo, rules.lotFeeKobo), rules.vatBps);
  const totalKobo = addKobo(hammerKobo, premiumKobo, rules.lotFeeKobo, vatKobo);
  return {
    hammerKobo,
    premiumKobo,
    lotFeeKobo: rules.lotFeeKobo,
    vatKobo,
    totalKobo,
  };
}
export function estimatedTotal(
  maxKobo: number,
  rules = DEFAULT_FEE_RULES,
): number {
  return calculateInvoiceLine(maxKobo, rules).totalKobo;
}

// Paystack DVA pricing checked 2026-10-24: 1%, capped at NGN 300.
// Bank charges outside Paystack are not part of the amount received.
export function quoteBankTransfer(transferKobo: number) {
  assertKobo(transferKobo);
  if (transferKobo === 0)
    throw new RangeError('Enter a positive transfer amount.');
  const calculated = rate(transferKobo, 100);
  const feeKobo = Math.min(calculated, 30000);
  return {
    transferKobo,
    feeKobo,
    creditKobo: transferKobo - feeKobo,
    currency: 'NGN' as const,
    feePolicy: 'paystack-dva-v1' as const,
  };
}

const LOCAL_FIXED_FEE_THRESHOLD_KOBO = 250000;
export function quoteCardFunding(
  amountKobo: number,
  cardType: 'local' | 'international',
) {
  assertKobo(amountKobo);
  if (amountKobo === 0)
    throw new RangeError('Enter a positive card payment amount.');
  if (cardType !== 'local' && cardType !== 'international')
    throw new RangeError('Choose a supported card fee tier.');
  const percentage = rate(amountKobo, cardType === 'local' ? 150 : 390);
  const fixed =
    cardType === 'international' || amountKobo >= LOCAL_FIXED_FEE_THRESHOLD_KOBO
      ? 10000
      : 0;
  const feeKobo =
    cardType === 'local'
      ? Math.min(percentage + fixed, 200000)
      : addKobo(percentage, fixed);
  if (feeKobo >= amountKobo)
    throw new RangeError('The card payment must exceed its processing fee.');
  return {
    amountKobo,
    cardType,
    feeKobo,
    creditKobo: amountKobo - feeKobo,
    currency: 'NGN' as const,
    feePolicy: `paystack-card-${cardType}-v1` as const,
  };
}
export const BID_FEE_VERSION = 'auction-fees-v1';

export const FIXED_PRICE_TAX_BPS = 750;
export function calculateFixedPrice(
  priceKobo: number,
  taxBps = FIXED_PRICE_TAX_BPS,
) {
  assertKobo(priceKobo);
  if (priceKobo === 0) throw new RangeError('Enter a positive fixed price.');
  const taxKobo = rate(priceKobo, taxBps);
  return { priceKobo, taxKobo, totalKobo: addKobo(priceKobo, taxKobo) };
}
export function quotePurchasePayment(
  totalKobo: number,
  method: 'local_card' | 'international_card' | 'bank_transfer',
) {
  assertKobo(totalKobo);
  if (!totalKobo) throw new RangeError('Enter a positive total.');
  const tier = method === 'international_card' ? 'international' : 'local';
  const upper = addKobo(totalKobo, Math.ceil(totalKobo / 10), 200000);
  const ranges =
    tier === 'local'
      ? [
          [totalKobo, LOCAL_FIXED_FEE_THRESHOLD_KOBO - 1],
          [Math.max(totalKobo, LOCAL_FIXED_FEE_THRESHOLD_KOBO), upper],
        ]
      : [[totalKobo, upper]];
  const candidates: number[] = [];
  for (const range of ranges) {
    let low = range[0] ?? 0;
    let high = range[1] ?? 0;
    if (low > high || quoteCardFunding(high, tier).creditKobo < totalKobo)
      continue;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      let creditKobo = 0;
      try {
        creditKobo = quoteCardFunding(middle, tier).creditKobo;
      } catch {
        /* Very small international payments cannot cover the fixed processor charge. */
      }
      if (creditKobo >= totalKobo) high = middle;
      else low = middle + 1;
    }
    candidates.push(low);
  }
  const quote = quoteCardFunding(Math.min(...candidates), tier);
  return {
    amountKobo: quote.amountKobo,
    feeKobo: quote.feeKobo,
    creditKobo: quote.creditKobo,
  };
}
