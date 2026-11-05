'use client';
import { useEffect, useRef } from 'react';
import {
  UserRound,
  ShieldCheck,
  SlidersHorizontal,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { staffInitials } from '@auction-ng/shared';
export function StaffAccountMenu({
  name,
  role,
  onProfile,
  onSecurity,
  onPreferences,
  onSignOut,
}: {
  name: string;
  role: string;
  onProfile: () => void;
  onSecurity: () => void;
  onPreferences: () => void;
  onSignOut: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (
        e.target instanceof Node &&
        !ref.current?.contains(e.target) &&
        ref.current
      )
        ref.current.open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const choose = (fn: () => void) => {
    if (ref.current) ref.current.open = false;
    fn();
  };
  return (
    <details className="lv-staff-account" ref={ref}>
      <summary aria-label="Open account menu">
        <span className="lv-staff-avatar" aria-hidden="true">
          {staffInitials(name)}
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="lv-staff-account-dropdown">
        <div className="lv-staff-account-name">
          <strong>{name}</strong>
          <small>{role}</small>
        </div>
        <button type="button" onClick={() => choose(onProfile)}>
          <UserRound size={18} />
          Profile
        </button>
        <button type="button" onClick={() => choose(onSecurity)}>
          <ShieldCheck size={18} />
          Account security
        </button>
        <button type="button" onClick={() => choose(onPreferences)}>
          <SlidersHorizontal size={18} />
          Preferences
        </button>
        <button
          className="lv-staff-account-logout"
          type="button"
          onClick={() => choose(onSignOut)}
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </details>
  );
}
