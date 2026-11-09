'use client';
import { useId, type InputHTMLAttributes } from 'react';

export function Input({
  label,
  hint,
  error,
  id,
  className = '',
  prefix,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  prefix?: string;
}) {
  const generated = useId();
  const field = id ?? generated;
  const control = (
    <input
      {...props}
      id={field}
      className={`agn-input ${className}`}
      aria-invalid={Boolean(error)}
      aria-describedby={error || hint ? `${field}-help` : undefined}
    />
  );
  return (
    <div className="agn-field">
      <label htmlFor={field}>{label}</label>
      {prefix ? (
        <div className="agn-input-with-prefix">
          <span aria-hidden="true">{prefix}</span>
          {control}
        </div>
      ) : (
        control
      )}
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
