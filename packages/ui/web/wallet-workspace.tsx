'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CircleAlert } from 'lucide-react';
import { Button } from './button';

export function WalletNotice({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry: () => void;
}) {
  return (
    <div className="agn-wallet-notice" role="alert">
      <CircleAlert size={22} aria-hidden="true" />
      <p>{children}</p>
      <Button variant="ghost" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function WalletHistoryPanel({ children }: { children: ReactNode }) {
  return (
    <section className="agn-wallet-history" aria-label="Transactions">
      {children}
    </section>
  );
}

export function WalletTable({
  label,
  columns,
  children,
}: {
  label: string;
  columns: readonly string[];
  children: ReactNode;
}) {
  return (
    <div
      className="agn-wallet-table-scroll"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className="agn-wallet-table">
        <caption className="agn-sr-only">{label}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function WalletBalanceArea({ children }: { children: ReactNode }) {
  return <div className="agn-wallet-balance-area">{children}</div>;
}

const methods = [
  { value: 'transfer', label: 'One-time bank transfer' },
  { value: 'local', label: 'Nigerian card' },
  { value: 'international', label: 'International card' },
] as const;
export type WalletPaymentMethod = (typeof methods)[number]['value'];

// Keep the three local choices mounted: opening this control never waits on a bank API.
export function WalletPaymentSelect({
  value,
  onChange,
  disabled,
}: {
  value: WalletPaymentMethod;
  onChange: (value: WalletPaymentMethod) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    root.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div
      ref={root}
      className="agn-field agn-wallet-method"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span id={`${id}-label`}>Payment method</span>
      <button
        ref={trigger}
        type="button"
        className="agn-input"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-controls={`${id}-choices`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span id={`${id}-value`}>
          {methods.find((method) => method.value === value)?.label}
        </span>
        <ChevronDown size={20} aria-hidden="true" />
      </button>
      <fieldset id={`${id}-choices`} hidden={!open}>
        <legend className="agn-sr-only">Payment method</legend>
        {methods.map((method) => (
          <label key={method.value}>
            <input
              type="radio"
              name={id}
              value={method.value}
              checked={value === method.value}
              disabled={disabled}
              onChange={() => onChange(method.value)}
            />
            <span>{method.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
