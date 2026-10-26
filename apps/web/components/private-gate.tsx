'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BuyerLink, BuyerSkeleton } from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { useBuyer } from '../lib/session';

export function PrivateGate({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { tokens, ready } = useBuyer();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (ready && !tokens && pathname !== '/sign-in' && pathname !== '/sign-up')
      router.replace(
        `/sign-in?${new URLSearchParams({ next: pathname + window.location.search })}`,
      );
  }, [ready, tokens, router, pathname]);
  return !ready ? (
    <BuyerPage narrow title={title}>
      <BuyerSkeleton />
    </BuyerPage>
  ) : !tokens ? (
    <BuyerPage narrow title={title}>
      <EmptyState
        title="Sign in to view your account"
        action={<BuyerLink href="/sign-in">Sign in with email</BuyerLink>}
      >
        Your wallet, bids and pickup passes are private.
      </EmptyState>
    </BuyerPage>
  ) : (
    <>{children}</>
  );
}
