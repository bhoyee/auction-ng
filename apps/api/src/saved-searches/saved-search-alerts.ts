import { Prisma } from '../generated/prisma/client';
import { savedSearchRules } from '@auction-ng/shared';
import type { LedgerService } from '../ledger/ledger-service';
import type { SearchEngine } from '../search/meilisearch-engine';
import { encryptPii } from '../security/pii';
import {
  SAVED_SEARCH_DIGEST_TEMPLATE,
  SAVED_SEARCH_INAPP_TEMPLATE,
  SAVED_SEARCH_INSTANT_TEMPLATE,
  type SavedSearchMail,
} from './saved-search-email';

type Db = LedgerService['db'];
type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

/** WAT is UTC+1 all year. */
export function watClock(now: Date) {
  const wat = new Date(now.getTime() + 3_600_000);
  return {
    date: wat.toISOString().slice(0, 10),
    hour: wat.getUTCHours(),
    midnight: new Date(
      Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate()) -
        3_600_000,
    ),
  };
}

const payload = (emailCiphertext: Uint8Array | null, message: unknown) =>
  encryptPii(
    JSON.stringify({
      emailCiphertext: emailCiphertext
        ? Buffer.from(emailCiphertext).toString('base64')
        : null,
      message,
    }),
    'notification',
  );

type Search = {
  id: string;
  userId: string;
  query: string;
  categoryId: string | null;
  locationId: string | null;
  maxPriceKobo: bigint | null;
  instantEmail: boolean;
  emailCiphertext: Uint8Array | null;
};

/**
 * Checks items that went live since the last check against every saved
 * search, using the same Meilisearch search buyers use. One checker runs at
 * a time (advisory lock); if Meilisearch fails, nothing is marked checked
 * and the next run tries again. Nothing here moves money.
 */
export async function scanSavedSearches(
  db: Db,
  engine: SearchEngine | undefined,
  enabled: boolean,
) {
  if (!enabled || !engine) return { lots: 0, alerts: 0 };
  return db.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtext('saved-search-scan')) AS locked`;
      if (!lock?.locked) return { lots: 0, alerts: 0 };
      // Live, indexed (no pending search job) and not yet checked for this run.
      const lots = await tx.$queryRaw<
        { id: string; scheduleVersion: number }[]
      >`SELECT l.id, l.schedule_version AS "scheduleVersion"
        FROM lots l
        JOIN search_index_jobs j ON j.lot_id = l.id
        LEFT JOIN saved_search_scans s ON s.lot_id = l.id
        WHERE l.status = 'open' AND l.start_at <= now()
          AND l.archived_at IS NULL AND l.deleted_at IS NULL
          AND (l.end_at > now() OR l.paused_at IS NOT NULL)
          AND j.version = j.applied_version
          AND (s.lot_id IS NULL OR s.schedule_version <> l.schedule_version)
        ORDER BY l.start_at, l.id
        LIMIT ${savedSearchRules.scanLots}`;
      if (!lots.length) return { lots: 0, alerts: 0 };
      const ids = lots.map((lot) => lot.id).sort();
      const searches = await tx.$queryRaw<Search[]>`
        SELECT s.id, s.user_id AS "userId", s.query, s.category_id AS "categoryId",
          s.location_id AS "locationId", s.max_price_kobo AS "maxPriceKobo",
          s.instant_email AS "instantEmail", u.email_ciphertext AS "emailCiphertext"
        FROM buyer_saved_searches s JOIN users u ON u.id = s.user_id
        WHERE u.role = 'buyer' AND u.status = 'active' AND u.email_verified_at IS NOT NULL
        ORDER BY s.user_id, s.created_at, s.id`;
      const hits = new Map<string, string[]>();
      const idFilter = `id IN [${ids.map((id) => JSON.stringify(id)).join(',')}]`;
      for (
        let start = 0;
        start < searches.length;
        start += savedSearchRules.searchesPerRequest
      ) {
        const chunk = searches.slice(
          start,
          start + savedSearchRules.searchesPerRequest,
        );
        const results = await engine.findMany(
          chunk.map((s) => ({
            q: s.query,
            filters: [
              idFilter,
              ...(s.categoryId
                ? [`categoryId = ${JSON.stringify(s.categoryId)}`]
                : []),
              ...(s.locationId
                ? [`locationId = ${JSON.stringify(s.locationId)}`]
                : []),
              ...(s.maxPriceKobo !== null
                ? [`startPriceKobo <= ${s.maxPriceKobo}`]
                : []),
            ],
            limit: ids.length,
          })),
        );
        chunk.forEach((s, i) => {
          const found = results[i]?.filter((id) => ids.includes(id));
          if (found?.length) hits.set(s.id, found.sort());
        });
      }
      const { midnight } = watClock(new Date());
      const sentToday = new Map<string, number>();
      let alerts = 0;
      for (const s of searches) {
        const found = hits.get(s.id);
        if (!found) continue;
        const added = await recordMatches(tx, s, found);
        if (!added.length) continue;
        alerts++;
        const first = added[0] as string;
        const search = {
          query: s.query,
          categoryId: s.categoryId,
          locationId: s.locationId,
          maxPriceKobo: s.maxPriceKobo === null ? null : Number(s.maxPriceKobo),
        };
        await tx.notification.createMany({
          data: [
            {
              userId: s.userId,
              channel: 'in_app',
              template: SAVED_SEARCH_INAPP_TEMPLATE,
              status: 'sent',
              sentAt: new Date(),
              reference: `saved-search:${s.id}:${first}`,
              payloadCiphertext: payload(null, {
                ...search,
                count: added.length,
              }),
            },
          ],
          skipDuplicates: true,
        });
        if (!s.instantEmail || !s.emailCiphertext) continue;
        let used = sentToday.get(s.userId);
        if (used === undefined)
          used = await tx.notification.count({
            where: {
              userId: s.userId,
              template: SAVED_SEARCH_INSTANT_TEMPLATE,
              createdAt: { gte: midnight },
            },
          });
        // Over the daily cap: these matches wait for the digest.
        if (used >= savedSearchRules.instantPerDay) continue;
        const message: SavedSearchMail = {
          kind: 'instant',
          groups: [
            {
              ...search,
              lotIds: added.slice(0, savedSearchRules.emailItems),
              total: added.length,
            },
          ],
        };
        const created = await tx.notification.createMany({
          data: [
            {
              userId: s.userId,
              channel: 'email',
              template: SAVED_SEARCH_INSTANT_TEMPLATE,
              reference: `saved-instant:${s.id}:${first}`,
              payloadCiphertext: payload(s.emailCiphertext, message),
            },
          ],
          skipDuplicates: true,
        });
        sentToday.set(s.userId, used + created.count);
        await tx.savedSearchMatch.updateMany({
          where: { userId: s.userId, lotId: { in: added } },
          data: { emailedAt: new Date() },
        });
      }
      const values = Prisma.join(
        lots.map(
          (lot) => Prisma.sql`(${lot.id}::uuid, ${lot.scheduleVersion}::int)`,
        ),
      );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO saved_search_scans (lot_id, schedule_version)
          VALUES ${values}
          ON CONFLICT (lot_id) DO UPDATE SET schedule_version = EXCLUDED.schedule_version, scanned_at = now()`,
      );
      return { lots: lots.length, alerts };
    },
    { maxWait: 5000, timeout: 60000 },
  );
}

/**
 * New matches for one buyer. A buyer hears about an item once, even when
 * several searches match it, and never for items they watch or bid on
 * (those have their own alerts).
 */
async function recordMatches(tx: Tx, s: Search, lotIds: string[]) {
  const rows = await tx.$queryRaw<{ lotId: string }[]>`
    INSERT INTO saved_search_matches (user_id, lot_id, saved_search_id)
    SELECT ${s.userId}::uuid, x.id, ${s.id}::uuid
    FROM unnest(${lotIds}::uuid[]) AS x(id)
    WHERE NOT EXISTS (SELECT 1 FROM watchlist w WHERE w.user_id = ${s.userId}::uuid AND w.lot_id = x.id)
      AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.user_id = ${s.userId}::uuid AND b.lot_id = x.id)
    ON CONFLICT (user_id, lot_id) DO NOTHING
    RETURNING lot_id AS "lotId"`;
  return rows.map((row) => row.lotId).sort();
}

/**
 * From 08:00 WAT, one digest per buyer per WAT day with matches not yet
 * emailed whose items are still live. The reference is unique per day, so a
 * retry or a second worker never sends two.
 */
export async function enqueueSavedSearchDigests(
  db: Db,
  enabled: boolean,
  now = new Date(),
) {
  const { date, hour } = watClock(now);
  if (!enabled || hour < savedSearchRules.digestHourWat) return { digests: 0 };
  return db.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtext('saved-search-digest')) AS locked`;
      if (!lock?.locked) return { digests: 0 };
      const users = await tx.$queryRaw<
        { userId: string; emailCiphertext: Uint8Array | null }[]
      >`SELECT u.id AS "userId", u.email_ciphertext AS "emailCiphertext"
        FROM users u
        WHERE u.role = 'buyer' AND u.status = 'active' AND u.email_verified_at IS NOT NULL
          AND u.saved_search_digest AND u.email_ciphertext IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM saved_search_matches m JOIN lots l ON l.id = m.lot_id
            WHERE m.user_id = u.id AND m.emailed_at IS NULL
              AND l.status = 'open' AND l.end_at > now() AND l.archived_at IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.reference = 'saved-digest:' || u.id::text || ':' || ${date})
        ORDER BY u.id
        LIMIT ${savedSearchRules.digestBuyers}`;
      for (const user of users) {
        const groups = await tx.$queryRaw<
          {
            query: string;
            categoryId: string | null;
            locationId: string | null;
            maxPriceKobo: bigint | null;
            lotIds: string[];
          }[]
        >`SELECT s.query, s.category_id AS "categoryId", s.location_id AS "locationId",
            s.max_price_kobo AS "maxPriceKobo",
            array_agg(m.lot_id::text ORDER BY l.end_at, l.id) AS "lotIds"
          FROM saved_search_matches m
          JOIN buyer_saved_searches s ON s.id = m.saved_search_id
          JOIN lots l ON l.id = m.lot_id
          WHERE m.user_id = ${user.userId}::uuid AND m.emailed_at IS NULL
            AND l.status = 'open' AND l.end_at > now() AND l.archived_at IS NULL
          GROUP BY s.id ORDER BY min(m.matched_at), s.id`;
        if (!groups.length) continue;
        const message: SavedSearchMail = {
          kind: 'digest',
          groups: groups.map((g) => ({
            query: g.query,
            categoryId: g.categoryId,
            locationId: g.locationId,
            maxPriceKobo:
              g.maxPriceKobo === null ? null : Number(g.maxPriceKobo),
            lotIds: g.lotIds.slice(0, savedSearchRules.emailItems),
            total: g.lotIds.length,
          })),
        };
        const created = await tx.notification.createMany({
          data: [
            {
              userId: user.userId,
              channel: 'email',
              template: SAVED_SEARCH_DIGEST_TEMPLATE,
              reference: `saved-digest:${user.userId}:${date}`,
              payloadCiphertext: payload(user.emailCiphertext, message),
            },
          ],
          skipDuplicates: true,
        });
        if (!created.count) continue;
        await tx.savedSearchMatch.updateMany({
          where: {
            userId: user.userId,
            emailedAt: null,
            lotId: { in: groups.flatMap((g) => g.lotIds) },
          },
          data: { emailedAt: new Date() },
        });
      }
      return { digests: users.length };
    },
    { maxWait: 5000, timeout: 60000 },
  );
}
