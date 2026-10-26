import type { ReactNode } from 'react';
import { ProductPhoto } from './product-photo';
import { NairaText } from './auction';
export { ProductPhoto } from './product-photo';

export function BuyerPage({
  title,
  description,
  children,
  action,
  narrow = false,
  layout,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  narrow?: boolean;
  layout?: 'wallet';
}) {
  return (
    <main
      className={`agn-container agn-buyer-page${narrow ? ' agn-buyer-page--narrow' : ''}${layout ? ` agn-buyer-page--${layout}` : ''}`}
    >
      <div className="agn-buyer-heading">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </main>
  );
}
export function BuyerPanel({ children }: { children: ReactNode }) {
  return <section className="agn-buyer-panel">{children}</section>;
}
export function BuyerActivityCard({
  image,
  title,
  href,
  reference,
  children,
}: {
  image?: string | null;
  title: string;
  href: string;
  reference: string;
  children: ReactNode;
}) {
  return (
    <article className="agn-activity-card">
      <a className="agn-activity-photo" href={href}>
        <ProductPhoto src={image ?? undefined} alt={title} />
      </a>
      <div>
        <small>{reference}</small>
        <h2>
          <a href={href}>{title}</a>
        </h2>
        {children}
      </div>
    </article>
  );
}
export function BuyerSkeleton() {
  return (
    <div
      className="agn-buyer-panel"
      role="status"
      aria-label="Loading account"
      aria-busy="true"
    >
      <div className="agn-buyer-stack">
        <span className="agn-skeleton-line" />
        <span className="agn-skeleton-price" />
        <span className="agn-skeleton-line" />
      </div>
    </div>
  );
}
export function BuyerStack({ children }: { children: ReactNode }) {
  return <div className="agn-buyer-stack">{children}</div>;
}
export function BuyerGrid({ children }: { children: ReactNode }) {
  return <div className="agn-buyer-grid">{children}</div>;
}
export function BuyerRail({ children }: { children: ReactNode }) {
  return <div className="agn-buyer-rail">{children}</div>;
}
export function CategoryTile({
  href,
  name,
  image,
  count,
}: {
  href: string;
  name: string;
  image?: string;
  count?: number;
}) {
  return (
    <a className="agn-category-tile agn-link" href={href}>
      <ProductPhoto src={image} alt={name} />
      <span>
        {name}
        {count !== undefined && <small>{count} open lots</small>}
      </span>
    </a>
  );
}
export function BuyerColumns({ children }: { children: ReactNode }) {
  return <div className="agn-buyer-columns">{children}</div>;
}
export function StickyBidBar({ children }: { children: ReactNode }) {
  return (
    <aside className="agn-bid-bar" aria-label="Quick bid">
      {children}
    </aside>
  );
}
export function BuyerRow({ children }: { children: ReactNode }) {
  return <div className="agn-buyer-row">{children}</div>;
}
export function BuyerLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="agn-link agn-buyer-link" href={href}>
      {children}
    </a>
  );
}
export function MoneyLine({
  label,
  value,
  total = false,
}: {
  label: string;
  value: ReactNode;
  total?: boolean;
}) {
  return (
    <div
      className={total ? 'agn-money-line agn-money-total' : 'agn-money-line'}
    >
      <span>{label}</span>
      <span>
        {typeof value === 'string' ? <NairaText value={value} /> : value}
      </span>
    </div>
  );
}
