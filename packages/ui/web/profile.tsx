import type { ReactNode } from 'react';
import { Check, LockKeyhole, Mail, UserRound } from 'lucide-react';

export function ProfileHeader({
  name,
  email,
  verified,
}: {
  name: string;
  email: string;
  verified: boolean;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('en-NG');
  return (
    <section className="agn-profile-identity" aria-label="Account overview">
      <span className="agn-profile-avatar" aria-hidden="true">
        {initials || <UserRound size={28} />}
      </span>
      <div className="agn-profile-person">
        <h2>{name}</h2>
        <p>
          <Mail size={16} aria-hidden="true" />
          {email}
        </p>
      </div>
      {verified && (
        <span className="agn-profile-verified">
          <Check size={16} aria-hidden="true" />
          Email verified
        </span>
      )}
    </section>
  );
}
export function ProfileSection({
  title,
  description,
  security = false,
  children,
}: {
  title: string;
  description: string;
  security?: boolean;
  children: ReactNode;
}) {
  const Icon = security ? LockKeyhole : UserRound;
  return (
    <section className="agn-profile-section" aria-label={title}>
      <header>
        <span className="agn-profile-section-icon">
          <Icon size={22} aria-hidden="true" />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="agn-profile-section-body">{children}</div>
    </section>
  );
}
export function ProfileFields({ children }: { children: ReactNode }) {
  return <div className="agn-profile-fields">{children}</div>;
}
export function ProfileWideField({ children }: { children: ReactNode }) {
  return <div className="agn-profile-field-wide">{children}</div>;
}
export function ProfileActions({ children }: { children: ReactNode }) {
  return <div className="agn-profile-actions">{children}</div>;
}
