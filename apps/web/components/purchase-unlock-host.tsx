'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useBuyer } from '../lib/session';
import { registerPurchaseUnlock } from '../lib/purchase-unlock';

// The dialog's code downloads only when a bid or purchase asks for it.
const PurchaseUnlockDialog = dynamic(
  () => import('./purchase-unlock-dialog').then((m) => m.PurchaseUnlockDialog),
  { ssr: false },
);

/** Opens "Confirm it's you" when the server asks, and reports the answer. */
export function PurchaseUnlockHost() {
  const { tokens } = useBuyer();
  const [request, setRequest] = useState<{
    id: number;
    resolve: (confirmed: boolean) => void;
  }>();
  useEffect(() => {
    if (!tokens) return;
    registerPurchaseUnlock(
      () =>
        new Promise<boolean>((resolve) =>
          setRequest({ id: Date.now(), resolve }),
        ),
    );
    return () => registerPurchaseUnlock(undefined);
  }, [tokens]);
  if (!request) return null;
  return (
    <PurchaseUnlockDialog
      key={request.id}
      onDone={(confirmed: boolean) => {
        request.resolve(confirmed);
        setRequest(undefined);
      }}
    />
  );
}
