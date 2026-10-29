'use client';
import { useEffect, useRef } from 'react';
import { BadgePercent, ChevronDown, Clock3, ShoppingBag } from 'lucide-react';
export function DealsHeading({
  title,
  section,
}: {
  title: string;
  section: string;
}) {
  const Icon =
    section === 'top-deals'
      ? BadgePercent
      : section === 'ending-soon'
        ? Clock3
        : ShoppingBag;
  const headingImage =
    section === 'top-deals'
      ? 'top-deals'
      : section === 'ending-soon'
        ? 'ending-soon'
        : title === 'All Deals'
          ? 'all-deals'
          : undefined;
  return (
    <header className="agn-deals-heading">
      {headingImage ? (
        <img
          src={`/banners/${headingImage}.webp`}
          alt=""
          width={112}
          height={112}
          className="agn-deals-heading-image"
        />
      ) : (
        <Icon aria-hidden="true" strokeWidth={1.5} />
      )}
      <h1 className={headingImage ? 'agn-deals-title-standard' : undefined}>
        {headingImage ? title.toUpperCase() : title}
      </h1>
    </header>
  );
}
export function CheckboxFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: readonly string[];
  onChange: (values: string[]) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target))
        ref.current?.removeAttribute('open');
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        ref.current.removeAttribute('open');
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <details
      className="agn-checkbox-filter"
      ref={ref}
      onToggle={(event) => {
        const root = event.currentTarget;
        if (root.open) {
          root.style.setProperty('--filter-shift', '0px');
          const bounds = root
            .querySelector('fieldset')
            ?.getBoundingClientRect();
          if (bounds) {
            const shift =
              bounds.right > window.innerWidth - 16
                ? window.innerWidth - 16 - bounds.right
                : bounds.left < 16
                  ? 16 - bounds.left
                  : 0;
            root.style.setProperty('--filter-shift', `${shift}px`);
          }
        }
      }}
    >
      <summary>
        {label}
        {selected.length > 0 && <span>{selected.length}</span>}
        <ChevronDown size={20} aria-hidden="true" />
      </summary>
      <fieldset>
        <legend className="agn-sr-only">{label}</legend>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((value) => value !== option.value),
                )
              }
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}
