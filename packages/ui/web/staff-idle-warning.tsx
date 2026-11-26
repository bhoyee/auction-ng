'use client';
import { useEffect, useId } from 'react';
import { Dialog } from './dialog';
import { Button } from './button';
import { BuyerStack } from './buyer';
import { Toast } from './toast';

export function StaffIdleWarning({
  open,
  seconds,
  busy,
  error,
  onStay,
  onSignOut,
  onDismissError,
  canContinue,
}: {
  open: boolean;
  seconds: number;
  busy: boolean;
  error: string;
  onStay(): void;
  onSignOut(): void;
  onDismissError(): void;
  canContinue: boolean;
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
    <Dialog
      open={open}
      title={canContinue ? 'Are you still there?' : 'Your session is ending'}
      onClose={onSignOut}
    >
      <BuyerStack>
        <p>Your staff session is about to end for your security.</p>
        <p role="timer">
          You will be signed out in <strong>{seconds} seconds</strong>.
        </p>
        <p>
          {canContinue
            ? 'Choose Stay signed in to continue. Staff sessions still end eight hours after sign-in.'
            : 'You have reached the eight-hour session limit. Save your work and sign in again.'}
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
