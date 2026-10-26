'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from '@auction-ng/ui/web/icons';
import type { MarketplaceCategory } from '@auction-ng/ui/web';
import { apiUrl } from '../lib/session';

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
          createSearchClient(apiUrl).search({ q: query.trim(), limit: 5 }),
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
        <Search size={20} aria-hidden="true" />
        <input
          name="q"
          type="search"
          placeholder="Search for your next great find"
          aria-label="Search auctions"
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
          onFocus={() => setOpen(true)}
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
        <button className="agn-button agn-button--primary" type="submit">
          Search
        </button>
      </form>
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
