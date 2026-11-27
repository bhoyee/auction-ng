'use client';
import { useEffect, useId } from 'react';
import { Dialog } from './dialog';
import { Button } from './button';
import { BuyerStack } from './buyer';
import { Toast } from './toast';

export function BuyerIdleWarning({
  open,
  seconds,
  busy,
  error,
  canContinue,
  onStay,
  onSignOut,
  onDismissError,
}: {
  open: boolean;
  seconds: number;
  busy: boolean;
  error: string;
  canContinue: boolean;
  onStay(): void;
  onSignOut(): void;
  onDismissError(): void;
}) {
  const continueId = useId();
  useEffect(() => {
    if (!open || !canContinue) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(continueId)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, canContinue, continueId]);
  return (
    <Dialog open={open} title="Are you still there?" onClose={onSignOut}>
      <BuyerStack>
        <p>
          To protect your wallet and account, we sign you out after 15 minutes
          of inactivity.
        </p>
        <p role="timer">
          Your session ends in <strong>{seconds} seconds</strong>.
        </p>
        {error && (
          <Toast tone="error" emphasis onClose={onDismissError}>
            {error}
          </Toast>
        )}
        {canContinue && (
          <Button id={continueId} onClick={onStay} busy={busy}>
            Stay signed in
          </Button>
        )}
        <Button variant="danger" onClick={onSignOut} disabled={busy}>
          Sign out
        </Button>
      </BuyerStack>
    </Dialog>
  );
}
