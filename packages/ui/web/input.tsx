'use client';
import { useId, type InputHTMLAttributes } from 'react';

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
