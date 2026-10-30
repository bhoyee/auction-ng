import type { ReactNode } from 'react';
import { CircleCheckBig, CircleX, Clock3 } from 'lucide-react';
export function PaymentStatusCard({
  status,
  title,
  children,
}: {
  status: 'confirmed' | 'pending' | 'failed';
  title?: string;
  children: ReactNode;
}) {
  const Icon =
    status === 'confirmed'
      ? CircleCheckBig
      : status === 'failed'
        ? CircleX
        : Clock3;
  return (
    <section className={`agn-payment-status agn-payment-status--${status}`}>
      <Icon size={56} strokeWidth={2} aria-hidden="true" />
      <h2>
        {title ??
          (status === 'confirmed'
            ? 'Payment confirmed'
            : status === 'failed'
              ? 'Payment failed'
              : 'Awaiting confirmation')}
      </h2>
      <div>{children}</div>
    </section>
  );
}
export function PaymentReturnLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      className="agn-button agn-button--primary agn-payment-return-link"
      href={href}
    >
      {children}
    </a>
  );
}
