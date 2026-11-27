/**
 * Recent searches (2026-11-27). Guests keep a short list in their own browser;
 * signed-in buyers keep a longer list on their account so it follows them to
 * other devices. The browser list is merged into the account on sign-in.
 * Pure helpers only (no Zod): the site header uses them on every page.
 */
export const searchHistoryRules = {
  /** Shown in the search box dropdown. */
  shown: 8,
  /** Kept per buyer account; older searches are removed. */
  kept: 20,
  /** Kept in a guest's browser. */
  guestKept: 8,
  /** Searches sent in one request (one new search, or a guest list merge). */
  maxPerRequest: 8,
  /** Equals searchRules.maxQueryLength (tested); copied so this file needs no Zod. */
  maxLength: 120,
  storageKey: 'giddydeal-recent-searches',
} as const;

/** Trims and collapses spaces; returns null when nothing searchable is left. */
export function normaliseSearch(text: string): string | null {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value) return null;
  return value.slice(0, searchHistoryRules.maxLength).trim();
}

/** Two searches that differ only in capitals or spacing are the same search. */
export function searchKey(text: string): string {
  return (normaliseSearch(text) ?? '').toLocaleLowerCase('en-NG');
}

/** Puts a search first, removes its older copy and keeps at most `max`. */
export function addRecentSearch(
  list: readonly string[],
  text: string,
  max: number = searchHistoryRules.guestKept,
): string[] {
  const value = normaliseSearch(text);
  if (!value) return list.slice(0, max);
  const key = searchKey(value);
  return [value, ...list.filter((item) => searchKey(item) !== key)].slice(
    0,
    max,
  );
}

/** Reads a stored guest list defensively: anything malformed is dropped. */
export function readRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .reduceRight<string[]>(
        (list, item) =>
          addRecentSearch(list, item, searchHistoryRules.guestKept),
        [],
      );
  } catch {
    return [];
  }
}
