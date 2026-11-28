import { z } from 'zod';
import {
  formatNaira,
  lotPath,
  savedSearchPath,
  savedSearchRules,
} from '@auction-ng/shared';
import type { LedgerService } from '../ledger/ledger-service';
import { paymentReturnUrl } from '../payments/payment-return-url';
import { emailImageUrl, firstName } from '../closing/result-mail-extras';
import template from './saved-search-email.generated.json';

type Tx = Parameters<Parameters<LedgerService['db']['$transaction']>[0]>[0];

export const SAVED_SEARCH_INSTANT_TEMPLATE = 'saved-search-instant-v1';
export const SAVED_SEARCH_DIGEST_TEMPLATE = 'saved-search-digest-v1';
export const SAVED_SEARCH_INAPP_TEMPLATE = 'saved-search-v1';

const search = {
  query: z.string().min(1).max(120),
  categoryId: z.uuid().nullable(),
  locationId: z.uuid().nullable(),
  maxPriceKobo: z.number().int().safe().positive().nullable(),
};
/** What is queued: only ids; titles, prices and photos are read at send time. */
export const savedSearchMailSchema = z
  .object({
    kind: z.enum(['instant', 'digest']),
    groups: z
      .array(
        z
          .object({
            ...search,
            lotIds: z.array(z.uuid()).min(1).max(savedSearchRules.emailItems),
            total: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(savedSearchRules.max),
  })
  .strict();
/** The in-app notice: one per saved search per check. */
export const savedSearchNoticeSchema = z
  .object({ ...search, count: z.number().int().positive() })
  .strict();
export type SavedSearchMail = z.output<typeof savedSearchMailSchema>;

/** An absolute site address for emails (PAYMENT_RETURN_ORIGIN is validated). */
export function siteUrl(path: string, id: string) {
  return new URL(path, paymentReturnUrl('purchase', id)).href;
}
export function searchLabel(query: string) {
  return `New deals for “${query}”`;
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
function fill(
  source: string,
  values: Record<string, string>,
  html: boolean,
  raw: Record<string, string> = {},
) {
  // One pass: inserted text (a title such as "{{x}}", or already-escaped
  // rows in {{{block}}}) is never filled a second time.
  return source.replace(
    /\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g,
    (_m, block: string | undefined, key: string | undefined) => {
      if (block) return raw[block] ?? '';
      const value = values[key ?? ''] ?? '';
      return html ? escape(value) : value;
    },
  );
}
const closes = (date: Date) =>
  date.toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' WAT';

export type MailItem = {
  id: string;
  title: string;
  lotNumber: string;
  startPriceKobo: number;
  endsAt: Date;
  imageUrl?: string;
};

/**
 * Reads the queued items that are still live. Groups whose items have all
 * closed are dropped; null means nothing is left to send.
 */
export async function savedSearchMailItems(tx: Tx, mail: SavedSearchMail) {
  const ids = [...new Set(mail.groups.flatMap((g) => g.lotIds))];
  const rows = await tx.lot.findMany({
    where: {
      id: { in: ids },
      status: 'open',
      archivedAt: null,
      deletedAt: null,
      endAt: { gt: new Date() },
    },
    select: {
      id: true,
      title: true,
      lotNumber: true,
      startPriceKobo: true,
      endAt: true,
      images: {
        where: { isDefect: false },
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: { url: true },
      },
    },
  });
  const byId = new Map<string, MailItem>(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        title: row.title,
        lotNumber: row.lotNumber,
        startPriceKobo: Number(row.startPriceKobo),
        endsAt: row.endAt,
        imageUrl: emailImageUrl(row.images[0]?.url),
      },
    ]),
  );
  return byId;
}

export function savedSearchEmail(
  input: SavedSearchMail,
  items: Map<string, MailItem>,
  name?: string | null,
) {
  const mail = savedSearchMailSchema.parse(input);
  const groups = mail.groups
    .map((g) => ({
      ...g,
      items: g.lotIds.flatMap((id) => {
        const item = items.get(id);
        return item ? [item] : [];
      }),
    }))
    .filter((g) => g.items.length);
  if (!groups.length) return null;
  const hi = firstName(name);
  const greeting = hi ? `Hi ${hi}, ` : '';
  const first = groups[0];
  const values =
    mail.kind === 'instant' && first
      ? {
          heading: searchLabel(first.query),
          intro: `${greeting}${first.total === 1 ? 'a new deal matches' : `${first.total} new deals match`} your saved search.`,
        }
      : {
          heading: 'New deals for your saved searches',
          intro: `${greeting}here are the latest deals that match your saved searches.`,
        };
  const manageUrl = siteUrl('/saved-searches', first?.items[0]?.id ?? '');
  const render = (html: boolean) =>
    groups
      .map((g) => {
        const path = savedSearchPath(g);
        const itemsOut = g.items
          .map((item) => {
            const row = fill(
              html ? template.item : template.itemText,
              {
                title: item.title,
                price: formatNaira(item.startPriceKobo),
                closes: closes(item.endsAt),
                itemUrl: siteUrl(lotPath(item), item.id),
                imageUrl: item.imageUrl ?? '',
              },
              html,
            );
            return html && !item.imageUrl
              ? row.replace(/<!--item-image-->[\s\S]*?<!--\/item-image-->/g, '')
              : row;
          })
          .join('');
        return fill(
          html ? template.group : template.groupText,
          {
            label:
              mail.kind === 'instant' ? `“${g.query}”` : searchLabel(g.query),
            more:
              g.total > g.items.length
                ? `See all ${g.total} deals`
                : 'See these deals',
            searchUrl: siteUrl(path, g.items[0]?.id ?? ''),
          },
          html,
          { items: itemsOut },
        );
      })
      .join('');
  const all = { ...values, manageUrl };
  return {
    Subject:
      mail.kind === 'instant' && first
        ? `${searchLabel(first.query)} — GiddyDeal`
        : 'New deals for your saved searches — GiddyDeal',
    Text: fill(template.text, all, false, { groups: render(false) }),
    HTML: fill(template.html, all, true, { groups: render(true) }),
  };
}
