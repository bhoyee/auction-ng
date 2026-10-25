import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

export function Header({
  search,
  account,
}: {
  search?: ReactNode;
  account?: ReactNode;
}) {
  return (
    <header className="agn-header">
      <div className="agn-container agn-header-inner">
        <a href="/" className="agn-wordmark" aria-label="Auction NG home">
          Auction NG
        </a>
        {search && (
          <div className="agn-header-search">
            <Search size={20} strokeWidth={1.75} aria-hidden="true" />
            {search}
          </div>
        )}
        {account && <nav aria-label="Account">{account}</nav>}
      </div>
    </header>
  );
}
export function Footer({ children }: { children?: ReactNode }) {
  return (
    <footer className="agn-footer">
      <div className="agn-container">
        <span className="agn-wordmark">Auction NG</span>
        {children ?? <p>Daily liquidation auctions in Nigeria.</p>}
      </div>
    </footer>
  );
}
export function DesignSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="agn-design-section">
      <div className="agn-section-heading">
        <span className="agn-section-number" aria-hidden="true">
          {number}
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="agn-section-content">{children}</div>
    </section>
  );
}
