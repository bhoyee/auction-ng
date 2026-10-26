import type { ReactNode } from 'react';
import { ProductPhoto } from './product-photo';
export { ProductPhoto } from './product-photo';

export function BuyerPage({
  title,
  description,
  children,
  action,
  narrow = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  narrow?: boolean;
}) {
  return (
    <main
      className={`agn-container agn-buyer-page${narrow ? ' agn-buyer-page--narrow' : ''}`}
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
}: {
  href: string;
  name: string;
  image?: string;
}) {
  return (
    <a className="agn-category-tile agn-link" href={href}>
      <ProductPhoto src={image} alt={name} />
      <span>{name}</span>
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
      <span>{value}</span>
    </div>
  );
}
