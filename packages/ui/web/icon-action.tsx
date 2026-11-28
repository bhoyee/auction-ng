'use client';
import type { ButtonHTMLAttributes, ComponentType } from 'react';

/**
 * A table-row action shown as an icon, with its name as a tooltip on hover
 * and keyboard focus (and as the accessible name). The tone colours the
 * hover state: danger for destructive actions, success for activating.
 */
export function IconAction({
  label,
  icon: Icon,
  tone = 'neutral',
  className = '',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  tone?: 'neutral' | 'primary' | 'success' | 'danger';
}) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      data-tooltip={label}
      className={`lv-icon-action lv-icon-action--${tone} ${className}`}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}
