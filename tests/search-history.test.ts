import { describe, expect, it } from 'vitest';
import {
  addRecentSearch,
  normaliseSearch,
  readRecentSearches,
  searchHistoryRules,
  searchKey,
} from '../packages/shared/src/search-history';
import { searchHistoryRecordSchema } from '../packages/shared/src/search-history-schemas';
import { searchRules } from '../packages/shared/src/search-schemas';

describe('recent searches', () => {
  it.each([
    ['  rice   cooker ', 'rice cooker'],
    ['\tblender\n', 'blender'],
    ['   ', null],
    ['', null],
  ])('normalises %j to %j', (input, expected) => {
    expect(normaliseSearch(input)).toBe(expected);
  });

  it('uses the same length limit as search', () => {
    expect(searchHistoryRules.maxLength).toBe(searchRules.maxQueryLength);
  });

  it('caps a search at 120 characters', () => {
    expect(normaliseSearch('a'.repeat(200))).toHaveLength(120);
  });

  it('treats capitals and spacing as the same search', () => {
    expect(searchKey(' Rice  Cooker')).toBe(searchKey('rice cooker'));
  });

  it('puts the newest first, replaces an older copy with the new wording and caps the list', () => {
    let list: string[] = [];
    for (const term of ['fan', 'kettle', 'iron'])
      list = addRecentSearch(list, term);
    expect(list).toEqual(['iron', 'kettle', 'fan']);
    expect(addRecentSearch(list, ' FAN ')).toEqual(['FAN', 'iron', 'kettle']);
    expect(addRecentSearch(list, '   ')).toEqual(list);
    for (let i = 0; i < 20; i += 1) list = addRecentSearch(list, `item ${i}`);
    expect(list).toHaveLength(searchHistoryRules.guestKept);
    expect(list[0]).toBe('item 19');
  });

  it('reads a stored guest list safely, dropping junk and duplicates', () => {
    expect(readRecentSearches(null)).toEqual([]);
    expect(readRecentSearches('not json')).toEqual([]);
    expect(readRecentSearches('{"a":1}')).toEqual([]);
    expect(readRecentSearches('["fan", 3, "Fan", " iron ", ""]')).toEqual([
      'fan',
      'iron',
    ]);
    const long = JSON.stringify(Array.from({ length: 30 }, (_, i) => `t${i}`));
    expect(readRecentSearches(long)).toEqual(
      Array.from({ length: 8 }, (_, i) => `t${i}`),
    );
  });

  it('refuses unknown fields, empty and oversized requests', () => {
    expect(
      searchHistoryRecordSchema.safeParse({ queries: ['fan'] }).success,
    ).toBe(true);
    expect(searchHistoryRecordSchema.safeParse({ queries: [] }).success).toBe(
      false,
    );
    expect(
      searchHistoryRecordSchema.safeParse({ queries: Array(9).fill('fan') })
        .success,
    ).toBe(false);
    expect(
      searchHistoryRecordSchema.safeParse({ queries: ['fan'], userId: 'x' })
        .success,
    ).toBe(false);
  });
});
