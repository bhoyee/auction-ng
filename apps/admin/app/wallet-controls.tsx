'use client';
import { useEffect, useRef, useState } from 'react';
import { createWalletControlsClient } from '@auction-ng/api-client/wallet-controls';
import { ApiError } from '@auction-ng/api-client/auth';
import type { WalletControls } from '@auction-ng/shared/wallet-controls-schemas';
import { WalletControlsPanel } from '@auction-ng/ui/web/wallet-controls-panel';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export function WalletControlsSettings({
  accessToken,
  deviceId,
  online,
}: {
  accessToken: string;
  deviceId: string;
  online: boolean;
}) {
  const [snapshot, setSnapshot] = useState<WalletControls>(),
    [deposits, setDeposits] = useState(false),
    [withdrawals, setWithdrawals] = useState(false),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [confirming, setConfirming] = useState(false),
    [version, setVersion] = useState(0);
  const dirty = useRef(false),
    key = useRef<string | undefined>(undefined),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const read = async () => {
      if (document.hidden || !navigator.onLine || dirty.current) return;
      try {
        const value = await createWalletControlsClient(apiUrl, {
          accessToken,
          deviceId,
        }).admin();
        if (active && !dirty.current) {
          setSnapshot(value);
          setDeposits(value.depositsEnabled);
          setWithdrawals(value.withdrawalsEnabled);
          setError('');
        }
      } catch {
        if (active && !dirty.current)
          setError(
            'Wallet controls could not be loaded. Reload settings before making changes.',
          );
      }
    };
    void read();
    const timer = setInterval(() => void read(), 15000);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
    };
  }, [accessToken, deviceId, version]);
  const change = () => {
    dirty.current = true;
    key.current = undefined;
    setSuccess('');
  };
  return (
    <WalletControlsPanel
      loading={!snapshot && !error}
      busy={busy}
      disabled={!online}
      depositsEnabled={deposits}
      withdrawalsEnabled={withdrawals}
      reason={reason}
      error={error}
      success={success}
      confirming={confirming}
      canSave={
        !!snapshot &&
        reason.trim().length >= 5 &&
        (deposits !== snapshot.depositsEnabled ||
          withdrawals !== snapshot.withdrawalsEnabled)
      }
      onDeposits={(value) => {
        change();
        setDeposits(value);
      }}
      onWithdrawals={(value) => {
        change();
        setWithdrawals(value);
      }}
      onReason={(value) => {
        change();
        setReason(value);
      }}
      onReload={() => {
        dirty.current = false;
        key.current = undefined;
        setReason('');
        setError('');
        setVersion((v) => v + 1);
      }}
      onConfirm={() => setConfirming(true)}
      onClose={() => {
        if (!busy) setConfirming(false);
      }}
      onDismiss={() => {
        setSuccess('');
        setError('');
      }}
      onSave={() =>
        void (async () => {
          if (!snapshot || busy) return;
          setBusy(true);
          setError('');
          key.current ??= crypto.randomUUID();
          try {
            const client = createWalletControlsClient(apiUrl, {
              accessToken,
              deviceId,
            });
            await client.update({
              depositsEnabled: deposits,
              withdrawalsEnabled: withdrawals,
              expectedRevision: snapshot.revision,
              reason: reason.trim(),
              idempotencyKey: key.current,
            });
            if (!mounted.current) return;
            dirty.current = false;
            key.current = undefined;
            setReason('');
            setConfirming(false);
            setSuccess(
              'Wallet controls saved. Buyer controls will update automatically.',
            );
            setVersion((v) => v + 1);
          } catch (cause) {
            if (mounted.current) {
              setConfirming(false);
              setError(
                cause instanceof ApiError && cause.status === 409
                  ? 'Another administrator changed these settings. Reload settings before saving.'
                  : cause instanceof ApiError && cause.status === 403
                    ? 'Only administrators can change wallet controls.'
                    : 'Settings could not be confirmed. Retry the same change or reload settings to check the current state.',
              );
            }
          } finally {
            if (mounted.current) setBusy(false);
          }
        })()
      }
    />
  );
}
