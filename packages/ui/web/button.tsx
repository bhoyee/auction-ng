'use client';
import { type ButtonHTMLAttributes } from 'react';

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
