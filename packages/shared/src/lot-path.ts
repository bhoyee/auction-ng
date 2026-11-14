/**
 * Readable lot addresses (owner decision 2026-11-14):
 * `/lots/iphone-15-256gb-black-unlocked-lot-2xxgqgjx`. The product name is
 * for people and search engines; the lot code at the end keeps every lot
 * unique, because liquidation stock often has many lots with one title.
 */
const SLUG_MAX = 60;
// Lot numbers: LOT- plus random letters/digits (older lots: LOT-000123);
// demo data uses DEMO- and DEMO-PREVIEW-.
const CODE = /(?:^|-)((?:demo-preview|demo|lot)-[a-z0-9]{4,16})$/;
/** A lot number as the API accepts it. */
export const LOT_NUMBER_PATTERN = /^(?:LOT|DEMO|DEMO-PREVIEW)-[A-Z0-9]{4,16}$/;

export function lotSlug(title: string) {
  const words = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = '';
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > SLUG_MAX) break;
    slug = next;
  }
  // A single very long word still gets a readable start.
  return slug || (words[0] ?? '').slice(0, SLUG_MAX);
}

/** The buyer address of a lot. */
export function lotPath(lot: { title: string; lotNumber: string }) {
  const code = lot.lotNumber.toLowerCase();
  const slug = lotSlug(lot.title);
  return `/lots/${slug ? `${slug}-` : ''}${code}`;
}

/** The lot number (e.g. "LOT-2XXGQGJX") at the end of an address part. */
export function parseLotPath(segment: string) {
  const match = CODE.exec(segment.toLowerCase());
  return match?.[1] ? match[1].toUpperCase() : null;
}
