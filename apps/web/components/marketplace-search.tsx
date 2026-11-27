'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, Search, X } from '@auction-ng/ui/web/icons';
import type { MarketplaceCategory } from '@auction-ng/ui/web';
import { apiUrl } from '../lib/session';
import { useRecentSearches } from '../lib/recent-searches';

export function MarketplaceSearch({
  categories,
}: {
  categories: MarketplaceCategory[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<{ id: string; title: string }[]>([]);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(-1);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const recentPanel = useRef<HTMLDivElement>(null);
  const recent = useRecentSearches();
  const showRecent = open && query.trim().length < 2 && recent.items.length > 0;
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const categoryMatches =
    query.trim().length >= 2
      ? categories
          .filter((category) =>
            category.name.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 3)
      : [];
  const options = [
    ...categoryMatches.map((category) => ({
      href: `/categories/${category.id}`,
      title: category.name,
      kind: 'Category',
    })),
    ...matches.map((lot) => ({
      // Search results carry only the id; it redirects to the readable address.
      href: `/lots/${lot.id}`,
      title: lot.title,
      kind: 'Lot',
    })),
  ];
  useEffect(() => {
    let active = true;
    setMatches([]);
    setSelected(-1);
    setStatus('');
    if (query.trim().length < 2) return;
    setStatus('Looking for matching lots…');
    const timer = setTimeout(() => {
      void import('@auction-ng/api-client/search')
        .then(({ createSearchClient }) =>
          createSearchClient(apiUrl).search({
            q: query.trim(),
            limit: 5,
          }),
        )
        .then((value) => {
          if (active) {
            setMatches(
              value.items.map((lot) => ({ id: lot.id, title: lot.title })),
            );
            setStatus(
              value.items.length
                ? ''
                : 'No matching lots. Try another item or category.',
            );
          }
        })
        .catch(() => {
          if (active)
            setStatus('Suggestions are unavailable. Use Search to try again.');
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <div
      className="agn-market-search"
      ref={box}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <form
        action="/search"
        onSubmit={(event) => {
          event.preventDefault();
          setOpen(false);
          router.push(`/search?${new URLSearchParams({ q: query.trim() })}`);
        }}
      >
        <input
          name="q"
          type="search"
          placeholder="Search deals"
          aria-label="Search deals"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && query.trim().length >= 2}
          aria-controls="auction-search-options"
          aria-activedescendant={
            open && selected >= 0 ? `auction-suggestion-${selected}` : undefined
          }
          autoComplete="off"
          maxLength={120}
          value={query}
          onFocus={() => {
            recent.load();
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              setSelected(-1);
            }
            if (event.key === 'ArrowDown' && showRecent) {
              event.preventDefault();
              recentPanel.current?.querySelector<HTMLElement>('a')?.focus();
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              if (!options.length) return;
              event.preventDefault();
              setOpen(true);
              setSelected((value) =>
                Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    value + (event.key === 'ArrowDown' ? 1 : -1),
                  ),
                ),
              );
            }
            if (
              event.key === 'Enter' &&
              open &&
              selected >= 0 &&
              options[selected]
            ) {
              event.preventDefault();
              setOpen(false);
              router.push(options[selected].href);
            }
          }}
        />
        <button
          className="agn-button agn-button--primary"
          type="submit"
          aria-label="Search"
        >
          <Search
            className="agn-search-submit-icon"
            size={20}
            aria-hidden="true"
          />
          <span>Search</span>
        </button>
      </form>
      {showRecent && (
        <div
          className="agn-search-suggestions agn-recent-searches"
          ref={recentPanel}
          role="region"
          aria-label="Recent searches"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              box.current?.querySelector('input')?.focus();
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            const links = [
              ...(recentPanel.current?.querySelectorAll<HTMLElement>('a') ??
                []),
            ];
            const index = links.indexOf(document.activeElement as HTMLElement);
            event.preventDefault();
            const next = index + (event.key === 'ArrowDown' ? 1 : -1);
            if (next < 0) box.current?.querySelector('input')?.focus();
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
                      setQuery(item);
                      go(href);
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
                      box.current?.querySelector('input')?.focus();
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
      )}
      {open && query.trim().length >= 2 && (
        <div
          className="agn-search-suggestions"
          id="auction-search-options"
          role="listbox"
          aria-label="Search suggestions"
        >
          {options.map((option, index) => (
            <a
              id={`auction-suggestion-${index}`}
              key={option.href}
              href={option.href}
              role="option"
              aria-selected={selected === index}
              onClick={() => setOpen(false)}
            >
              <Search size={16} aria-hidden="true" />
              <span>
                {option.title}
                <small>{option.kind}</small>
              </span>
            </a>
          ))}
          {status && <p role="status">{status}</p>}
        </div>
      )}
    </div>
  );
}
