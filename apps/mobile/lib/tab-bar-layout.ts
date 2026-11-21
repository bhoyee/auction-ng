/** Pure tab-bar rules, kept apart from the view so they can be tested. */
export const tabBarLayout = {
  /** Watching count on the raised Watchlist button; none when zero. */
  badge(count: number | null | undefined) {
    if (!count || !Number.isSafeInteger(count) || count <= 0) return undefined;
    return count > 99 ? '99+' : String(count);
  },
};
