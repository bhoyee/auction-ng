'use client';
import { ShieldCheck } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Dialog } from './dialog';
import { Toast } from './toast';
export function WalletControlsPanel({
  loading,
  busy,
  disabled,
  depositsEnabled,
  withdrawalsEnabled,
  reason,
  error,
  success,
  confirming,
  canSave,
  onDeposits,
  onWithdrawals,
  onReason,
  onReload,
  onConfirm,
  onSave,
  onClose,
  onDismiss,
}: {
  loading: boolean;
  busy: boolean;
  disabled: boolean;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  reason: string;
  error: string;
  success: string;
  confirming: boolean;
  canSave: boolean;
  onDeposits: (value: boolean) => void;
  onWithdrawals: (value: boolean) => void;
  onReason: (value: string) => void;
  onReload: () => void;
  onConfirm: () => void;
  onSave: () => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="agn-wallet-controls-panel" aria-label="Wallet controls">
      <div className="agn-admin-heading">
        <div>
          <h2>
            <ShieldCheck size={24} aria-hidden="true" />
            Wallet controls
          </h2>
          <p>
            Manage new wallet deposits and withdrawal requests across the
            marketplace.
          </p>
        </div>
        <Button
          variant="secondary"
          size="small"
          disabled={busy || disabled}
          onClick={onReload}
        >
          Reload settings
        </Button>
      </div>
      <p className="agn-hint">
        Existing payments and transfers continue to reconcile. These controls do
        not cancel requests or change wallet balances.
      </p>
      {loading ? (
        <p role="status">Loading wallet controls…</p>
      ) : (
        <>
          <div className="agn-wallet-controls-options">
            <label>
              <div>
                <strong>New deposits</strong>
                <span>Card and one-time bank transfer wallet funding</span>
              </div>
              <span
                className={`agn-wallet-control-state${depositsEnabled ? '' : ' agn-wallet-control-state--paused'}`}
              >
                {depositsEnabled ? 'Enabled' : 'Paused'}
              </span>
              <input
                type="checkbox"
                aria-label="Allow new deposits"
                checked={depositsEnabled}
                disabled={busy || disabled || !!error}
                onChange={(e) => onDeposits(e.target.checked)}
              />
            </label>
            <label>
              <div>
                <strong>New withdrawals</strong>
                <span>New requests to a buyer’s verified bank account</span>
              </div>
              <span
                className={`agn-wallet-control-state${withdrawalsEnabled ? '' : ' agn-wallet-control-state--paused'}`}
              >
                {withdrawalsEnabled ? 'Enabled' : 'Paused'}
              </span>
              <input
                type="checkbox"
                aria-label="Allow new withdrawals"
                checked={withdrawalsEnabled}
                disabled={busy || disabled || !!error}
                onChange={(e) => onWithdrawals(e.target.checked)}
              />
            </label>
          </div>
          <Input
            label="Reason for change"
            value={reason}
            maxLength={240}
            disabled={busy || disabled || !!error}
            onChange={(e) => onReason(e.target.value)}
            hint="Required. Recorded with your staff account in the audit log."
          />
          <Button
            disabled={!canSave || busy || disabled || !!error}
            onClick={onConfirm}
          >
            Review wallet controls
          </Button>
        </>
      )}
      {error && (
        <Toast tone="error" emphasis onClose={onDismiss}>
          {error}
        </Toast>
      )}
      {success && (
        <Toast tone="success" emphasis onClose={onDismiss}>
          {success}
        </Toast>
      )}
      <Dialog
        open={confirming}
        title="Update wallet controls?"
        onClose={onClose}
      >
        <div className="agn-buyer-stack">
          <p>
            New deposits:{' '}
            <strong>{depositsEnabled ? 'Enabled' : 'Paused'}</strong>
          </p>
          <p>
            New withdrawals:{' '}
            <strong>{withdrawalsEnabled ? 'Enabled' : 'Paused'}</strong>
          </p>
          <p>
            Existing checkouts, withdrawal verification and transfers will keep
            processing.
          </p>
          <Button busy={busy} disabled={disabled} onClick={onSave}>
            Save wallet controls
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Keep current settings
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
