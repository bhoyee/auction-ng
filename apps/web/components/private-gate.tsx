'use client';
import { type ReactNode } from 'react';
import {
  BuyerLink,
  BuyerPage,
  EmptyState,
  BuyerSkeleton,
} from '@auction-ng/ui/web';
import { useBuyer } from '../lib/session';

export function PrivateGate({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { tokens, ready } = useBuyer();
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
