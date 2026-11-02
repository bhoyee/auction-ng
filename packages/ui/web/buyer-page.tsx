import type { ReactNode } from 'react';
export function BuyerPage({
  title,
  description,
  children,
  action,
  narrow = false,
  layout,
  headingStyle,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  narrow?: boolean;
  layout?: 'wallet' | 'lot';
  headingStyle?: 'deals';
}) {
  return (
    <main
      className={`agn-container agn-buyer-page${narrow ? ' agn-buyer-page--narrow' : ''}${layout ? ` agn-buyer-page--${layout}` : ''}`}
    >
      <div className="agn-buyer-heading">
        <div>
          <h1
            className={
              headingStyle === 'deals' ? 'agn-deals-title-standard' : undefined
            }
          >
            {title}
          </h1>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </main>
  );
}
