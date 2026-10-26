'use client';
import { useId, type SelectHTMLAttributes } from 'react';

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
