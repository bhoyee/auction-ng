import type { ReactNode } from 'react';
export function BuyerPage({
  title,
  description,
  children,
  action,
  narrow = false,
  layout,
  headingStyle,
  headingIcon,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  narrow?: boolean;
  layout?: 'wallet' | 'lot';
  headingStyle?: 'deals';
  /** Shown before the title on deals-style pages, like the deals headings. */
  headingIcon?: ReactNode;
}) {
  const heading = (
    <h1
      className={
        headingStyle === 'deals' ? 'agn-deals-title-standard' : undefined
      }
    >
      {title}
    </h1>
  );
  return (
    <main
      className={`agn-container agn-buyer-page${narrow ? ' agn-buyer-page--narrow' : ''}${layout ? ` agn-buyer-page--${layout}` : ''}`}
    >
      <div className="agn-buyer-heading">
        <div>
          {headingIcon ? (
            <div className="agn-buyer-title-row">
              {headingIcon}
              {heading}
            </div>
          ) : (
            heading
          )}
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </main>
  );
}
