'use client';
import { useId, type TextareaHTMLAttributes } from 'react';
export function Textarea({
  label,
  hint,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
}) {
  const generated = useId(),
    field = id ?? generated;
  return (
    <div className="agn-field">
      <label htmlFor={field}>{label}</label>
      <textarea
        {...props}
        id={field}
        className="agn-input agn-textarea"
        aria-describedby={hint ? `${field}-help` : undefined}
      />
      {hint && (
        <p id={`${field}-help`} className="agn-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
