import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { searchRules } from '@auction-ng/shared';

export type SearchDocument = {
  id: string;
  lotNumber: string;
  title: string;
  description: string;
  categoryId: string;
  locationId: string;
  startPriceKobo: number;
  endAtMs: number;
};
export type SearchHit = { id: string; endAtMs: number };
export interface SearchEngine {
  initialize(): Promise<void>;
  upsert(documents: SearchDocument[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  find(q: string, filters: string[], limit: number): Promise<SearchHit[]>;
}
export class MeilisearchEngine implements SearchEngine {
  private initialized = false;
  private readonly pendingTasks = new Map<
    string,
    { fingerprint: string; uid: number }
  >();
  private readonly origin: string;
  private readonly index: string;
  constructor(
    url: string,
    private readonly key: string,
    index = searchRules.indexName as string,
  ) {
    const parsed = new URL(url);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      !key ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(index)
    )
      throw new Error(
        'Configure a private Meilisearch origin, key and valid index name.',
      );
    this.origin = parsed.origin;
    this.index = encodeURIComponent(index);
  }
  private async request(
    path: string,
    method = 'GET',
    body?: unknown,
    allowMissing = false,
  ): Promise<unknown> {
    try {
      const response = await fetch(new URL(path, this.origin), {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(searchRules.requestTimeoutMs),
      });
      if (allowMissing && response.status === 404) return null;
      if (!response.ok) throw new Error('Search engine request failed.');
      return await response.json();
    } catch {
      throw new ServiceUnavailableException(
        'Search is temporarily unavailable. Try again shortly.',
      );
    }
  }
  private async task(path: string, method: string, body: unknown) {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([path, method, body]))
      .digest('hex');
    const operation = `${method} ${path}`;
    const previous = this.pendingTasks.get(operation);
    // Finish an older write before submitting newer content for this operation.
    // Only four fixed operation slots exist, so retries cannot grow the cache.
    if (previous && previous.fingerprint !== fingerprint)
      await this.waitTask(operation, previous.uid);
    let pending = this.pendingTasks.get(operation);
    if (!pending) {
      const uid = z
        .object({ taskUid: z.number().int().nonnegative() })
        .parse(await this.request(path, method, body)).taskUid;
      pending = { fingerprint, uid };
      this.pendingTasks.set(operation, pending);
    }
    await this.waitTask(operation, pending.uid);
  }
  private async waitTask(operation: string, taskUid: number) {
    const deadline = Date.now() + searchRules.requestTimeoutMs;
    while (Date.now() < deadline) {
      const task = z
        .object({
          status: z.enum([
            'enqueued',
            'processing',
            'succeeded',
            'failed',
            'canceled',
          ]),
        })
        .parse(await this.request(`/tasks/${taskUid}`));
      if (task.status === 'succeeded') {
        this.pendingTasks.delete(operation);
        return;
      }
      if (task.status === 'failed' || task.status === 'canceled') {
        this.pendingTasks.delete(operation);
        throw new ServiceUnavailableException(
          'Search indexing failed. Retry the job.',
        );
      }
      await delay(25);
    }
    throw new ServiceUnavailableException(
      'Search indexing timed out. Retry the job.',
    );
  }
  async initialize() {
    if (this.initialized) return;
    if (
      (await this.request(`/indexes/${this.index}`, 'GET', undefined, true)) ===
      null
    )
      await this.task('/indexes', 'POST', {
        uid: decodeURIComponent(this.index),
        primaryKey: 'id',
      });
    await this.task(`/indexes/${this.index}/settings`, 'PATCH', {
      searchableAttributes: ['title', 'lotNumber', 'description'],
      displayedAttributes: ['id', 'endAtMs'],
      filterableAttributes: [
        'id',
        'categoryId',
        'locationId',
        'startPriceKobo',
        'endAtMs',
      ],
      sortableAttributes: ['endAtMs', 'id'],
      // Closing-time order allows a strict keyset across all typo-matched hits.
      rankingRules: [
        'sort',
        'words',
        'typo',
        'proximity',
        'attribute',
        'exactness',
      ],
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
      },
    });
    this.initialized = true;
  }
  async upsert(documents: SearchDocument[]) {
    if (documents.length)
      await this.task(`/indexes/${this.index}/documents`, 'POST', documents);
  }
  async remove(ids: string[]) {
    if (ids.length)
      await this.task(
        `/indexes/${this.index}/documents/delete-batch`,
        'POST',
        ids,
      );
  }
  async find(q: string, filters: string[], limit: number) {
    const result = z
      .object({
        hits: z
          .array(
            z
              .object({
                id: z.uuid(),
                endAtMs: z.number().int().safe().nonnegative(),
              })
              .strict(),
          )
          .max(51),
      })
      .parse(
        await this.request(`/indexes/${this.index}/search`, 'POST', {
          q,
          filter: filters,
          sort: ['endAtMs:asc', 'id:asc'],
          limit,
          attributesToRetrieve: ['id', 'endAtMs'],
          matchingStrategy: 'all',
        }),
      );
    return result.hits;
  }
}
export function configuredSearchEngine(): SearchEngine | undefined {
  if (!process.env.MEILISEARCH_URL || !process.env.MEILI_MASTER_KEY)
    return undefined;
  return new MeilisearchEngine(
    process.env.MEILISEARCH_URL,
    process.env.MEILI_MASTER_KEY,
    process.env.MEILISEARCH_INDEX,
  );
}
