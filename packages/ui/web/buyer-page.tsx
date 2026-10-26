import type { ReactNode } from 'react';
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
