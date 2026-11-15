'use client';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../web/button';
import { Dialog } from '../web/dialog';

export type ConfirmOptions = {
  title: string;
  /** What will happen, in plain words. */
  message: ReactNode;
  confirmLabel: string;
  /** Danger styles the action red; delete also asks the person to type a word. */
  tone?: 'danger' | 'default';
  /** Word the person must type before the action unlocks, e.g. "DELETE". */
  requireText?: string;
};

// Typed confirmation is case-insensitive and ignores surrounding spaces:
// the point is a deliberate action, not a spelling test.
export function confirmationMatches(typed: string, required: string) {
  return typed.trim().toLowerCase() === required.trim().toLowerCase();
}

/**
 * Promise-based replacement for window.confirm:
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ ... }))) return;
 *   ...render {dialog} once in the component.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );
  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);
  const dialog = (
    <ConfirmDialog
      options={options}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );
  return { confirm, dialog };
}

export function ConfirmDialog({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const required = options?.requireText;
  const unlocked = !required || confirmationMatches(typed, required);
  const close = () => {
    setTyped('');
    onCancel();
  };
  return (
    <Dialog
      open={options !== null}
      onClose={close}
      title={options?.title ?? ''}
      className="agn-confirm-dialog"
    >
      {options && (
        <form
          className="agn-confirm"
          onSubmit={(event) => {
            event.preventDefault();
            if (!unlocked) return;
            setTyped('');
            onConfirm();
          }}
        >
          <div
            className={`agn-confirm-message${options.tone === 'danger' ? ' agn-confirm-message--danger' : ''}`}
          >
            {options.tone === 'danger' && (
              <AlertTriangle size={22} aria-hidden="true" />
            )}
            <div>{options.message}</div>
          </div>
          {required && (
            <div className="agn-field agn-confirm-type">
              <label htmlFor={inputId}>
                Type <strong>{required}</strong> to confirm
              </label>
              <input
                id={inputId}
                className="agn-input"
                value={typed}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
          )}
          <div className="agn-confirm-actions">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={options.tone === 'danger' ? 'danger' : 'primary'}
              disabled={!unlocked}
            >
              {options.confirmLabel}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/**
 * Standard delete wording. "move" sends the item to Deleted items (it can be
 * restored); "permanent" removes it for good from Deleted items.
 */
export function deleteConfirmation(
  kind: string,
  name: string,
  mode: 'move' | 'permanent' = 'move',
): ConfirmOptions {
  return mode === 'move'
    ? {
        title: `Delete ${kind}?`,
        message: (
          <>
            <p>
              <strong>{name}</strong> will move to Deleted items.
            </p>
            <p>
              You can restore it from Deleted items in Lot setup. The deletion
              is recorded with your name and the time.
            </p>
          </>
        ),
        confirmLabel: `Delete ${kind}`,
        tone: 'danger',
        requireText: 'DELETE',
      }
    : {
        title: `Delete ${kind} permanently?`,
        message: (
          <>
            <p>
              <strong>{name}</strong> will be permanently deleted.
            </p>
            <p>
              This can’t be undone or restored. The deletion is recorded with
              your name and the time.
            </p>
          </>
        ),
        confirmLabel: 'Delete permanently',
        tone: 'danger',
        requireText: 'DELETE',
      };
}
