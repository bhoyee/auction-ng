export function WatchlistCount({ count }: { count?: number }) {
  if (count === undefined) return null;
  return (
    <span
      className="agn-watch-count"
      aria-hidden="true"
      data-watchlist-count={count}
      title={`${count} saved items`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
