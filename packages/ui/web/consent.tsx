'use client';
import { type InputHTMLAttributes, type ReactNode } from 'react';

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
