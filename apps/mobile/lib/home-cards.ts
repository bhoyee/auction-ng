import { formatNaira } from '@auction-ng/shared/money';

const PENDING = '—';
const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Copy for the home summary cards. A value still loading shows a dash, never
 * a made-up zero; savings are labelled estimates because retail prices are.
 */
export function homeCardCopy(input: {
  availableKobo?: number;
  awaitingPickup?: number;
  savedKobo?: number;
  paidItems?: number;
}) {
  const { availableKobo, awaitingPickup, savedKobo, paidItems } = input;
  return {
    wallet: {
      label: 'Wallet balance',
      value: availableKobo === undefined ? PENDING : formatNaira(availableKobo),
      detail: 'Tap to top up or view activity',
    },
    pickup: {
      label: 'Awaiting pickup',
      value:
        awaitingPickup === undefined
          ? PENDING
          : awaitingPickup === 0
            ? 'All collected'
            : plural(awaitingPickup, 'item'),
      detail:
        awaitingPickup && awaitingPickup > 0
          ? 'Bring your pickup pass to collect'
          : 'Paid wins to collect appear here',
    },
    savings: {
      label: 'Saved vs retail',
      value: savedKobo === undefined ? PENDING : formatNaira(savedKobo),
      detail:
        paidItems === undefined
          ? 'Estimated savings'
          : paidItems === 0
            ? 'Win your first deal to start saving'
            : `Estimated, on ${plural(paidItems, 'paid item')}`,
    },
  };
}
