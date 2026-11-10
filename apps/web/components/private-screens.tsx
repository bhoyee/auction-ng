'use client';
import dynamic from 'next/dynamic';
import { BuyerSkeleton } from '@auction-ng/ui/web/buyer';

// Private screens render only inside PrivateGate, after the buyer is signed
// in. Loading them on demand keeps their code out of the first download for
// guests, who are redirected to sign in (first-load JS budget, AGENTS.md §7).
const loading = () => <BuyerSkeleton />;

export const Wallet = dynamic(
  () => import('./wallet').then((m) => m.Wallet),
  { ssr: false, loading },
);
export const Account = dynamic(
  () => import('./account').then((m) => m.Account),
  { ssr: false, loading },
);
export const AwaitingPickup = dynamic(
  () => import('./awaiting-pickup').then((m) => m.AwaitingPickup),
  { ssr: false, loading },
);
export const PickupCheckIn = dynamic(
  () => import('./pickup-check-in').then((m) => m.PickupCheckIn),
  { ssr: false, loading },
);
export const CustomerService = dynamic(
  () => import('./customer-service').then((m) => m.CustomerService),
  { ssr: false, loading },
);
export const BuyerHistory = dynamic(
  () => import('./buyer-history').then((m) => m.BuyerHistory),
  { ssr: false, loading },
);
export const Invoice = dynamic(
  () => import('./invoice').then((m) => m.Invoice),
  { ssr: false, loading },
);
export const MyBids = dynamic(
  () => import('./my-bids').then((m) => m.MyBids),
  { ssr: false, loading },
);
export const PaymentReturn = dynamic(
  () => import('./payment-return').then((m) => m.PaymentReturn),
  { ssr: false, loading },
);
export const PickupStorage = dynamic(
  () => import('./pickup-storage').then((m) => m.PickupStorage),
  { ssr: false, loading },
);
export const PurchaseHistory = dynamic(
  () => import('./purchase-history').then((m) => m.PurchaseHistory),
  { ssr: false, loading },
);
