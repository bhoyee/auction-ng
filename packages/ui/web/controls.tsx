'use client';

import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
} from 'react';
import { parseNairaInput } from '../presentation';

export function Button({
  variant = 'primary',
  size = 'regular',
  busy = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'regular' | 'large';
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`agn-button agn-button--${variant} agn-button--${size} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}
export function Consent({
  children,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  children: ReactNode;
}) {
  return (
    <label className="agn-consent">
      <input {...props} type="checkbox" />
      <span>{children}</span>
    </label>
  );
}

export function Input({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generated = useId();
  const field = id ?? generated;
  return (
    <div className="agn-field">
      <label htmlFor={field}>{label}</label>
      <input
        {...props}
        id={field}
        className={`agn-input ${className}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${field}-help` : undefined}
      />
      {(error || hint) && (
        <p
          id={`${field}-help`}
          className={error ? 'agn-field-error' : 'agn-hint'}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function OtpInput(
  props: Omit<
    Parameters<typeof Input>[0],
    'inputMode' | 'autoComplete' | 'maxLength' | 'pattern' | 'type'
  >,
) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      pattern="[0-9]{6}"
      className="agn-otp"
    />
  );
}

export function NairaInput({
  label = 'Bid amount (₦)',
  onAmountChange,
  initialValue = '',
  ...props
}: Omit<
  Parameters<typeof Input>[0],
  'value' | 'onChange' | 'label' | 'type'
> & {
  label?: string;
  onAmountChange: (kobo: number | undefined) => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Input
      {...props}
      label={label}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onAmountChange(parseNairaInput(event.target.value));
      }}
    />
  );
}

export function Select({
  label,
  hint,
  error,
  children,
  id,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generated = useId();
  const field = id ?? generated;
  return (
    <div className="agn-field">
      <label htmlFor={field}>{label}</label>
      <select
        {...props}
        id={field}
        className="agn-input"
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${field}-help` : undefined}
      >
        {children}
      </select>
      {(error || hint) && (
        <p
          id={`${field}-help`}
          className={error ? 'agn-field-error' : 'agn-hint'}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

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
