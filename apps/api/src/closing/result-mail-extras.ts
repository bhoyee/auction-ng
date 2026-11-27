import type { LedgerService } from '../ledger/ledger-service';

type Tx = Parameters<Parameters<LedgerService['db']['$transaction']>[0]>[0];

/** "Tunde Bakare" → "Tunde". Nothing when the name doesn't start like a name. */
export function firstName(name: string | null | undefined) {
  const first = name?.trim().split(/\s+/)[0]?.slice(0, 60);
  return first && /^\p{L}[\p{L}'’.-]*$/u.test(first) ? first : undefined;
}

/**
 * The item photo as an address email apps can load: absolute, HTTPS (or
 * loopback in development), and not SVG, which most email apps block.
 */
export function emailImageUrl(stored: string | null | undefined) {
  if (!stored) return undefined;
  try {
    const url = new URL(
      stored,
      process.env.PAYMENT_RETURN_ORIGIN ?? 'http://localhost:3300',
    );
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
      return undefined;
    if (url.username || url.password || /\.svg$/i.test(url.pathname))
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Buyer's first name and the item's main photo, read when the email is sent. */
export async function resultMailExtras(
  tx: Tx,
  userId: string,
  lotNumber: string,
) {
  // One after the other: queries on one transaction connection run in turn.
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const lot = await tx.lot.findUnique({
    where: { lotNumber },
    select: {
      images: {
        where: { isDefect: false },
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: { url: true },
      },
    },
  });
  const name = firstName(user?.name);
  const imageUrl = emailImageUrl(lot?.images[0]?.url);
  return {
    ...(name ? { firstName: name } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}
