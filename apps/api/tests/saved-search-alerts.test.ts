import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { LedgerService } from '../src/ledger/ledger-service';
import { BuyerService } from '../src/buyers/buyer-service';
import { SavedSearchService } from '../src/saved-searches/saved-search-service';
import {
  enqueueSavedSearchDigests,
  scanSavedSearches,
  watClock,
} from '../src/saved-searches/saved-search-alerts';
import {
  savedSearchEmail,
  savedSearchMailItems,
  savedSearchMailSchema,
} from '../src/saved-searches/saved-search-email';
import type { SearchEngine } from '../src/search/meilisearch-engine';
import { NotificationService } from '../src/closing/notification-service';
import { decryptPii, encryptPii, hashPii } from '../src/security/pii';

let ledger: LedgerService;
let buyers: BuyerService;
let saved: SavedSearchService;
let categoryId: string;
let locationId: string;
const titles = new Map<string, string>();

/**
 * Stands in for Meilisearch: a lot matches when its title contains the
 * search words and its id is in the request's id filter.
 */
function engine(fail = false): SearchEngine & { calls: number } {
  const fake = {
    calls: 0,
    initialize: async () => {},
    upsert: async () => {},
    remove: async () => {},
    find: async () => [],
    async findMany(queries: { q: string; filters: string[] }[]) {
      fake.calls++;
      if (fail) throw new Error('Search is temporarily unavailable.');
      return queries.map(({ q, filters }) => {
        const ids = [...(filters[0] ?? '').matchAll(/"([0-9a-f-]{36})"/g)].map(
          (m) => m[1] as string,
        );
        return ids.filter((id) =>
          titles.get(id)?.toLowerCase().includes(q.toLowerCase()),
        );
      });
    },
  };
  return fake;
}

beforeAll(async () => {
  const url = process.env.SAVED_SEARCH_TEST_DATABASE_URL;
  if (
    !url ||
    process.env.NODE_ENV !== 'test' ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw Error('Isolated test database required');
  ledger = new LedgerService(url);
  buyers = new BuyerService(url);
  categoryId = (
    await ledger.db.category.create({
      data: { name: `Phones ${randomUUID().slice(0, 8)}`, slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        name: `Ikeja ${randomUUID().slice(0, 8)}`,
        code: randomUUID().slice(0, 30),
        address: 'Synthetic test address',
        hours: {},
        capacityPerSlot: 20,
      },
    })
  ).id;
  saved = new SavedSearchService(ledger.db, true, {
    searchMatches: async (ids) =>
      ids.map(
        (id) =>
          ({ id }) as never as Awaited<
            ReturnType<SavedSearchService['newItems']>
          >['items'][number],
      ),
  });
});
afterAll(async () => {
  await ledger?.db.$disconnect();
  await buyers?.db.$disconnect();
});

async function buyer(options: { verified?: boolean; name?: string } = {}) {
  const email = `${randomUUID()}@example.test`;
  return (
    await ledger.db.user.create({
      data: {
        name: options.name ?? 'Tunde Bakare',
        emailCiphertext: encryptPii(email, 'email'),
        emailHash: hashPii(email, 'email'),
        emailVerifiedAt: options.verified === false ? null : new Date(),
      },
    })
  ).id;
}
async function lot(
  title: string,
  options: { indexed?: boolean; endsInMs?: number } = {},
) {
  const row = await ledger.db.lot.create({
    data: {
      title,
      description: 'Test fixture',
      condition: 'open_box',
      retailPriceKobo: 900000n,
      startPriceKobo: 50000n,
      startAt: new Date(Date.now() - 60000),
      endAt: new Date(Date.now() + (options.endsInMs ?? 3600000)),
      categoryId,
      locationId,
      status: 'open',
    },
  });
  titles.set(row.id, title);
  if (options.indexed !== false) await indexed(row.id);
  return row;
}
async function indexed(lotId: string) {
  await ledger.db
    .$executeRaw`UPDATE search_index_jobs SET applied_version = version WHERE lot_id = ${lotId}::uuid`;
}
async function search(userId: string, query: string, instantEmail = false) {
  const { id } = await saved.save(userId, { query });
  if (instantEmail) await saved.update(userId, id, true);
  return id;
}
const notices = (userId: string, template: string) =>
  ledger.db.notification.findMany({
    where: { userId, template },
    orderBy: { createdAt: 'asc' },
  });
const message = (row: { payloadCiphertext: Uint8Array }) =>
  JSON.parse(decryptPii(Buffer.from(row.payloadCiphertext), 'notification'))
    .message as unknown;
const tag = () => `tag${randomUUID().replaceAll('-', '').slice(0, 10)}`;

describe('matching new live items', () => {
  it('sends one in-app alert per search, links to the item, and never repeats', async () => {
    const user = await buyer();
    const word = tag();
    await search(user, word);
    const a = await lot(`Samsung ${word} phone`);
    const b = await lot(`Tecno ${word} phone`);
    const fake = engine();
    await scanSavedSearches(ledger.db, fake, true);
    await scanSavedSearches(ledger.db, fake, true);
    const inApp = await notices(user, 'saved-search-v1');
    expect(inApp).toHaveLength(1);
    expect(inApp[0]?.status).toBe('sent');
    expect(message(inApp[0] as never)).toMatchObject({ query: word, count: 2 });
    expect(
      await ledger.db.savedSearchMatch.count({ where: { userId: user } }),
    ).toBe(2);
    expect(await notices(user, 'saved-search-instant-v1')).toHaveLength(0);
    const feed = await buyers.notifications(user, 10);
    expect(feed.items[0]).toMatchObject({
      title: `2 new deals match “${word}”`,
      href: `/lots/${[a.id, b.id].sort()[0]}`,
    });
    // Unread in the bell like any other notice.
    expect((await buyers.notificationSummary(user)).unread).toBe(1);
  });

  it('tells a buyer about an item once even when two searches match', async () => {
    const user = await buyer();
    const word = tag();
    await search(user, word);
    await search(user, `${word} phone`);
    await lot(`${word} phone`);
    await scanSavedSearches(ledger.db, engine(), true);
    expect(
      await ledger.db.savedSearchMatch.count({ where: { userId: user } }),
    ).toBe(1);
    expect(await notices(user, 'saved-search-v1')).toHaveLength(1);
  });

  it('skips watched or bid-on items, unverified buyers, and switched-off alerts', async () => {
    const watcher = await buyer();
    const unverified = await buyer({ verified: false });
    const word = tag();
    await search(watcher, word);
    await ledger.db.buyerSavedSearch.create({
      data: { userId: unverified, query: word, filterKey: `${word}|||` },
    });
    const item = await lot(`${word} speaker`);
    await ledger.db.watchlist.create({
      data: { userId: watcher, lotId: item.id },
    });
    await scanSavedSearches(ledger.db, engine(), false);
    expect(
      await ledger.db.savedSearchScan.count({ where: { lotId: item.id } }),
    ).toBe(0);
    await scanSavedSearches(ledger.db, engine(), true);
    expect(
      await ledger.db.savedSearchMatch.count({ where: { lotId: item.id } }),
    ).toBe(0);
    expect(
      await ledger.db.notification.count({
        where: {
          userId: { in: [watcher, unverified] },
          template: { startsWith: 'saved-search' },
        },
      }),
    ).toBe(0);
  });

  it('waits for the search index, and retries after a Meilisearch failure', async () => {
    const user = await buyer();
    const word = tag();
    await search(user, word);
    const item = await lot(`${word} blender`, { indexed: false });
    await scanSavedSearches(ledger.db, engine(), true);
    expect(
      await ledger.db.savedSearchScan.count({ where: { lotId: item.id } }),
    ).toBe(0);
    await indexed(item.id);
    await expect(
      scanSavedSearches(ledger.db, engine(true), true),
    ).rejects.toThrow();
    expect(
      await ledger.db.savedSearchScan.count({ where: { lotId: item.id } }),
    ).toBe(0);
    await scanSavedSearches(ledger.db, engine(), true);
    expect(
      await ledger.db.savedSearchMatch.count({ where: { userId: user } }),
    ).toBe(1);
    expect(
      await ledger.db.savedSearchScan.count({ where: { lotId: item.id } }),
    ).toBe(1);
  });

  it('runs one check at a time', async () => {
    const user = await buyer();
    const word = tag();
    await search(user, word);
    await lot(`${word} kettle`);
    await Promise.all([
      scanSavedSearches(ledger.db, engine(), true),
      scanSavedSearches(ledger.db, engine(), true),
      scanSavedSearches(ledger.db, engine(), true),
    ]);
    await scanSavedSearches(ledger.db, engine(), true);
    expect(await notices(user, 'saved-search-v1')).toHaveLength(1);
    expect(
      await ledger.db.savedSearchMatch.count({ where: { userId: user } }),
    ).toBe(1);
  });
});

describe('emails', () => {
  it('sends at most 3 "straight away" emails a day; the rest wait for the digest', async () => {
    const user = await buyer();
    const words = [tag(), tag(), tag(), tag()];
    for (const word of words) await search(user, word, true);
    for (const word of words) await lot(`${word} fridge`);
    await scanSavedSearches(ledger.db, engine(), true);
    expect(await notices(user, 'saved-search-v1')).toHaveLength(4);
    expect(await notices(user, 'saved-search-instant-v1')).toHaveLength(3);
    expect(
      await ledger.db.savedSearchMatch.count({
        where: { userId: user, emailedAt: null },
      }),
    ).toBe(1);
    // A later item for the same buyer is over the cap too.
    await lot(`${words[0]} freezer`);
    await scanSavedSearches(ledger.db, engine(), true);
    expect(await notices(user, 'saved-search-instant-v1')).toHaveLength(3);
    expect(
      await ledger.db.savedSearchMatch.count({
        where: { userId: user, emailedAt: null },
      }),
    ).toBe(2);
  });

  it('sends one digest per buyer per day from 8:00 WAT, live items only', async () => {
    const user = await buyer();
    const quiet = await buyer();
    const word = tag();
    await search(user, word);
    await search(quiet, word);
    await ledger.db.user.update({
      where: { id: quiet },
      data: { savedSearchDigest: false },
    });
    const live = await lot(`${word} iron`);
    const closing = await lot(`${word} toaster`);
    await scanSavedSearches(ledger.db, engine(), true);
    await ledger.db.lot.update({
      where: { id: closing.id },
      data: { status: 'closed' },
    });
    const day = watClock(new Date()).date;
    const early = new Date(`${day}T06:59:00Z`); // 07:59 WAT
    const late = new Date(`${day}T07:00:00Z`); // 08:00 WAT
    await enqueueSavedSearchDigests(ledger.db, true, early);
    expect(await notices(user, 'saved-search-digest-v1')).toHaveLength(0);
    await enqueueSavedSearchDigests(ledger.db, false, late);
    expect(await notices(user, 'saved-search-digest-v1')).toHaveLength(0);
    await enqueueSavedSearchDigests(ledger.db, true, late);
    await enqueueSavedSearchDigests(ledger.db, true, late);
    const digests = await notices(user, 'saved-search-digest-v1');
    expect(digests).toHaveLength(1);
    expect(digests[0]?.reference).toBe(`saved-digest:${user}:${day}`);
    const mail = savedSearchMailSchema.parse(message(digests[0] as never));
    expect(mail.groups[0]?.lotIds).toEqual([live.id]);
    expect(await notices(quiet, 'saved-search-digest-v1')).toHaveLength(0);
    expect(
      await ledger.db.savedSearchMatch.count({
        where: { userId: user, lotId: live.id, emailedAt: null },
      }),
    ).toBe(0);
  });

  it('the delivery run checks, emails straight away once, and stops when switched off', async () => {
    // Earlier tests leave other pending mail; set it aside for this run.
    await ledger.db.notification.updateMany({
      where: { status: 'pending' },
      data: { status: 'failed' },
    });
    const user = await buyer({ name: 'Ngozi Okafor' });
    const word = tag();
    await search(user, word, true);
    await lot(`${word} microwave`);
    const sent: { Subject: string; HTML: string }[] = [];
    const mail = {
      async send(_to: string, message: { Subject: string; HTML: string }) {
        sent.push(message);
      },
    };
    const service = new NotificationService(ledger, mail as never, {
      searchEngine: engine(),
      savedSearchesEnabled: true,
    });
    await service.deliver();
    await service.deliver();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.Subject).toBe(`New deals for “${word}” — GiddyDeal`);
    expect(sent[0]?.HTML).toContain('Hi Ngozi,');
    // Switched off after queuing: the queued email is not sent.
    const later = await buyer();
    const other = tag();
    await search(later, other, true);
    await lot(`${other} mixer`);
    await scanSavedSearches(ledger.db, engine(), true);
    await new NotificationService(ledger, mail as never, {
      searchEngine: engine(),
      savedSearchesEnabled: false,
    }).deliver();
    expect(sent).toHaveLength(1);
    expect((await notices(later, 'saved-search-instant-v1'))[0]?.status).toBe(
      'failed',
    );
  });

  it('renders a short, escaped email and leaves out closed items', async () => {
    const live = await lot('<b>Infinix</b> {{manageUrl}} phone');
    await ledger.db.lotImage.create({
      data: {
        lotId: live.id,
        url: 'https://images.example.test/infinix.webp',
        sortOrder: 0,
      },
    });
    const closed = await lot('Old radio');
    await ledger.db.lot.update({
      where: { id: closed.id },
      data: { status: 'closed' },
    });
    const mail = savedSearchMailSchema.parse({
      kind: 'instant',
      groups: [
        {
          query: 'phone',
          categoryId: null,
          locationId: null,
          maxPriceKobo: null,
          lotIds: [live.id, closed.id],
          total: 2,
        },
      ],
    });
    const items = await ledger.db.$transaction((tx) =>
      savedSearchMailItems(tx, mail),
    );
    const content = savedSearchEmail(mail, items, 'Tunde Bakare');
    expect(content?.Subject).toBe('New deals for “phone” — GiddyDeal');
    expect(content?.HTML).toContain('Hi Tunde,');
    expect(content?.HTML).toContain('&lt;b&gt;Infinix&lt;/b&gt; {{manageUrl}}');
    expect(content?.HTML).not.toContain('Old radio');
    expect(content?.HTML).toContain('https://images.example.test/infinix.webp');
    expect(content?.HTML).toContain('/saved-searches');
    expect(content?.Text).toContain('<b>Infinix</b>');
    // No photo: the image block is removed, the item stays.
    await ledger.db.lotImage.deleteMany({ where: { lotId: live.id } });
    const plain = savedSearchEmail(
      mail,
      await ledger.db.$transaction((tx) => savedSearchMailItems(tx, mail)),
    );
    expect(plain?.HTML).not.toContain('<img src="https://images');
    expect(plain?.HTML).toContain('Infinix');
    // Nothing left to send.
    await ledger.db.lot.update({
      where: { id: live.id },
      data: { status: 'closed' },
    });
    expect(
      savedSearchEmail(
        mail,
        await ledger.db.$transaction((tx) => savedSearchMailItems(tx, mail)),
      ),
    ).toBeNull();
  });
});

describe('saved searches page', () => {
  it('counts new matches, clears them when viewed, and keeps each buyer to their own', async () => {
    const user = await buyer();
    const other = await buyer();
    const word = tag();
    const id = await search(user, word);
    await lot(`${word} laptop`);
    await scanSavedSearches(ledger.db, engine(), true);
    const page = await saved.list(user);
    expect(page.digest).toBe(true);
    expect(page.items[0]).toMatchObject({
      id,
      newMatches: 1,
      instantEmail: false,
    });
    expect((await saved.summary(user)).newMatches).toBe(1);
    expect((await saved.newItems(user, 8)).items).toHaveLength(1);
    await expect(saved.viewed(other, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(saved.update(other, id, true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await saved.viewed(user, id);
    expect((await saved.summary(user)).newMatches).toBe(0);
    expect((await saved.newItems(user, 8)).items).toHaveLength(0);
    await saved.settings(user, false);
    expect((await saved.list(user)).digest).toBe(false);
    // Removing a search removes its matches.
    await saved.remove(user, id);
    expect(
      await ledger.db.savedSearchMatch.count({ where: { userId: user } }),
    ).toBe(0);
  });
});
