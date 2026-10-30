'use client';
import { useId, useState } from 'react';
import { Check, Search } from 'lucide-react';

export function SearchSelect({
  label,
  options,
  value,
  onChange,
  loading = false,
  disabled = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((item) => item.value === value);
  const matches = options.filter((item) =>
    item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  function choose(option: (typeof options)[number]) {
    if (disabled) return;
    onChange(option.value);
    setQuery('');
    setOpen(false);
    setActive(0);
  }
  return (
    <div
      className="agn-search-select agn-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery('');
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="agn-search-select-field">
        <Search size={20} aria-hidden="true" />
        <input
          id={id}
          className="agn-input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !disabled}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && matches[active] ? `${id}-option-${active}` : undefined
          }
          autoComplete="off"
          placeholder={
            loading && !options.length
              ? 'Loading banks…'
              : 'Search for your bank'
          }
          value={open ? query : (selected?.label ?? '')}
          disabled={disabled}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
            if (value) onChange('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setQuery('');
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              const next = open
                ? Math.max(
                    0,
                    Math.min(
                      matches.length - 1,
                      active + (event.key === 'ArrowDown' ? 1 : -1),
                    ),
                  )
                : 0;
              setActive(next);
              document
                .getElementById(`${id}-option-${next}`)
                ?.scrollIntoView({ block: 'nearest' });
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (matches[active]) choose(matches[active]);
            }
          }}
        />
      </div>
      {open && !disabled && (
        <div className="agn-search-select-menu">
          <ul
            id={`${id}-options`}
            role="listbox"
            aria-label={`${label} results`}
            aria-busy={loading}
          >
            {matches.map((option, index) => (
              <li
                id={`${id}-option-${index}`}
                key={option.value}
                role="option"
                aria-selected={value === option.value}
                className={
                  index === active ? 'agn-search-select-active' : undefined
                }
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(option)}
              >
                {option.label}
                {value === option.value && (
                  <Check size={20} aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
          {!matches.length && (
            <p role="status">
              {loading
                ? 'Loading banks…'
                : 'No matching banks. Try another name.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
