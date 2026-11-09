'use client';
import { useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
export function PasswordInput({
  label,
  hint,
  error,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generated = useId(),
    field = id ?? generated;
  const [visible, setVisible] = useState(false);
  return (
    <div className="agn-field">
      <label htmlFor={field}>{label}</label>
      <div className="agn-password-control">
        <input
          {...props}
          id={field}
          type={visible ? 'text' : 'password'}
          className="agn-input"
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? field + '-help' : undefined}
        />
        <button
          type="button"
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
          disabled={props.disabled}
        >
          {visible ? (
            <EyeOff size={20} aria-hidden="true" />
          ) : (
            <Eye size={20} aria-hidden="true" />
          )}
        </button>
      </div>
      {(error || hint) && (
        <p
          id={field + '-help'}
          className={error ? 'agn-field-error' : 'agn-hint'}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
