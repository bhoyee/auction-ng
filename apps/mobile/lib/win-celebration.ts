/**
 * Win celebration rules (owner request, 2026-11-20): when a buyer opens the
 * app after winning an auction, celebrate it once. Shown wins are remembered
 * per account on this phone.
 */
export type WinInvoice = {
  id: string;
  saleType: 'auction' | 'fixed_price';
  status: string;
  createdAt: string;
  totalKobo: number;
};

const DAY = 24 * 60 * 60 * 1000;
/** Celebrate wins up to two weeks old... */
export const CELEBRATE_WITHIN_MS = 14 * DAY;
/** ...but the first time on a phone, only very recent ones. */
export const FIRST_RUN_WITHIN_MS = 2 * DAY;
const REMEMBER = 60;

export const celebratedKey = (userId: string) =>
  `giddydeal.celebrated.v1.${userId}`;

/** Auction wins that may still be celebrated, newest first. */
export function celebrationCandidates(
  invoices: readonly WinInvoice[],
  seen: ReadonlySet<string>,
  now: number,
  firstRun: boolean,
) {
  const window = firstRun ? FIRST_RUN_WITHIN_MS : CELEBRATE_WITHIN_MS;
  return invoices
    .filter((invoice) => {
      const at = Date.parse(invoice.createdAt);
      return (
        invoice.saleType === 'auction' &&
        (invoice.status === 'pending' || invoice.status === 'paid') &&
        !seen.has(invoice.id) &&
        Number.isFinite(at) &&
        at <= now + 60_000 &&
        now - at <= window
      );
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Add newly shown wins, keeping the most recent few. */
export function rememberCelebrated(
  previous: readonly string[],
  shown: readonly string[],
) {
  return [...new Set([...shown, ...previous])].slice(0, REMEMBER);
}

/** Parse what was stored; anything unreadable counts as a first run. */
export function readCelebrated(stored: string | null) {
  if (stored === null) return { firstRun: true, ids: [] as string[] };
  try {
    const value: unknown = JSON.parse(stored);
    if (Array.isArray(value) && value.every((id) => typeof id === 'string'))
      return { firstRun: false, ids: value as string[] };
  } catch {
    // Fall through: treat a damaged value like a first run.
  }
  return { firstRun: true, ids: [] as string[] };
}
