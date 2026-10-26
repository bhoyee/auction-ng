'use client';
import { useId, type ReactNode } from 'react';

export function Tabs({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly { value: string; label: string; panel: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="agn-tabs">
      <div role="tablist" aria-label={label}>
        {items.map((item, index) => (
          <button
            type="button"
            key={item.value}
            role="tab"
            id={`${id}-tab-${item.value}`}
            aria-controls={`${id}-panel-${item.value}`}
            aria-selected={value === item.value}
            tabIndex={value === item.value ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              let target: number | undefined;
              if (event.key === 'ArrowRight')
                target = (index + 1) % items.length;
              if (event.key === 'ArrowLeft')
                target = (index + items.length - 1) % items.length;
              if (event.key === 'Home') target = 0;
              if (event.key === 'End') target = items.length - 1;
              if (target === undefined) return;
              event.preventDefault();
              const next = items[target];
              if (next) {
                onChange(next.value);
                const tabs =
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  );
                tabs?.[target]?.focus();
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          role="tabpanel"
          key={item.value}
          id={`${id}-panel-${item.value}`}
          aria-labelledby={`${id}-tab-${item.value}`}
          hidden={value !== item.value}
          tabIndex={0}
        >
          {item.panel}
        </div>
      ))}
    </div>
  );
}
