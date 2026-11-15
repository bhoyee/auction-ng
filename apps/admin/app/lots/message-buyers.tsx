'use client';
import { useState } from 'react';
import { ApiError } from '@auction-ng/api-client/auth';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import { Textarea } from '@auction-ng/ui/web/textarea';

/**
 * Message a live lot's bidders and watchers from its page, through the same
 * audited, idempotent Live monitor message (in-app, email and phone alerts).
 */
export function MessageBuyersDialog({
  lotNumber,
  bidders,
  watchers,
  onClose,
  send,
  onSent,
}: {
  lotNumber: string;
  bidders: number;
  watchers: number;
  onClose: () => void;
  send: (message: string, reason: string, key: string) => Promise<string>;
  onSent: (text: string) => void;
}) {
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One key per message: a retry after a dropped connection never sends twice.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const ready = message.trim().length >= 5 && reason.trim().length >= 5;
  async function submit() {
    setBusy(true);
    setError('');
    try {
      onSent(await send(message.trim(), reason.trim(), key));
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 403)
        setError('Your role can’t message buyers. Ask an admin.');
      else if (failure instanceof ApiError && failure.status === 400) {
        setKey(crypto.randomUUID());
        setError(
          'This lot isn’t live any more, so it can’t be messaged from here.',
        );
      } else
        setError(
          'The message couldn’t be confirmed. Try again; it won’t be sent twice.',
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={`Message buyers on ${lotNumber}`}
    >
      <form
        className="lv-lots-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p>
          Goes to everyone who bid on or watches this lot ({bidders}{' '}
          {bidders === 1 ? 'bid' : 'bids'}, {watchers} watching) as an in-app
          message, email and phone alert where they allow it.
        </p>
        <Textarea
          label="Message"
          value={message}
          rows={4}
          maxLength={2000}
          placeholder="e.g. We added a photo of the charger. The box has a small dent on one side."
          onChange={(e) => setMessage(e.target.value)}
          hint="Plain words. Buyers see this exactly as written."
        />
        <Input
          label="Reason (for the audit log)"
          value={reason}
          maxLength={1000}
          placeholder="e.g. Correcting what's included"
          onChange={(e) => setReason(e.target.value)}
        />
        {error && (
          <p className="lv-lots-error" role="alert">
            {error}
          </p>
        )}
        <div className="lv-lots-dialog-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!ready}>
            Send message
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
