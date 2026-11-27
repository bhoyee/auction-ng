'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { History, X } from '@auction-ng/ui/web/icons';
import { useRecentSearches } from '../lib/recent-searches';

/**
 * The "Recent searches" list under the empty search box. Loaded only when the
 * box is first opened, so it adds nothing to the page's first load (2026-11-27:
 * loading it with every page tipped the home page over its 3.5 s budget).
 */
export default function RecentSearchesPanel({
  box,
  onPick,
  onClose,
}: {
  box: RefObject<HTMLDivElement | null>;
  onPick: (query: string, href: string) => void;
  onClose: () => void;
}) {
  const recent = useRecentSearches();
  const panel = useRef<HTMLDivElement>(null);
  const { load } = recent;
  useEffect(() => load(), [load]);
  const input = () => box.current?.querySelector('input');
  if (!recent.items.length) return null;
  return (
    <div
      className="agn-search-suggestions agn-recent-searches"
      ref={panel}
      role="region"
      aria-label="Recent searches"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
          input()?.focus();
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const links = [
          ...(panel.current?.querySelectorAll<HTMLElement>('a') ?? []),
        ];
        const index = links.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        const next = index + (event.key === 'ArrowDown' ? 1 : -1);
        if (next < 0) input()?.focus();
        else links[Math.min(next, links.length - 1)]?.focus();
      }}
    >
      <div className="agn-recent-searches__head">
        <h2>Recent searches</h2>
        <button type="button" onClick={() => void recent.clear()}>
          Clear all
        </button>
      </div>
      <ul>
        {recent.items.map((item) => {
          const href = `/search?${new URLSearchParams({ q: item })}`;
          return (
            <li key={item}>
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  onPick(item, href);
                }}
              >
                <History size={16} aria-hidden="true" />
                <span>{item}</span>
              </a>
              <button
                type="button"
                aria-label={`Remove "${item}" from recent searches`}
                onClick={() => {
                  // Keep the panel open: focus stays inside the search box.
                  input()?.focus();
                  void recent.remove(item);
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
