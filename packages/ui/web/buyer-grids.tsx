import type { ReactNode } from 'react';
export function BuyerGrid({
  children,
  columns,
}: {
  children: ReactNode;
  columns?: 3 | 4;
}) {
  return (
    <div
      className={`agn-buyer-grid${columns === 3 ? ' agn-buyer-grid--three' : ''}`}
    >
      {children}
    </div>
  );
}
export function BuyerRail({ children }: { children: ReactNode }) {
  return <div className="agn-buyer-rail">{children}</div>;
}
