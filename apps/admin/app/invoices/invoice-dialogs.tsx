'use client';
import { useState, type ReactNode } from 'react';
import {
  refundReasonLabels,
  refundReasons,
  type InvoiceRefund,
  type InvoiceView,
  type RefundReason,
} from '@auction-ng/shared';
import type { InvoicesClient } from '@auction-ng/api-client/invoices';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';
import { Textarea } from '@auction-ng/ui/web/textarea';
import { confirmationMatches } from '@auction-ng/ui/admin/confirm-dialog';
import { fieldErrors } from '../batches/batch-ui';
import { money, nairaValue, saveFile } from './invoice-ui';

/** One confirmed change with its retry key: a retry never applies it twice. */
function useChange(onDone: (message: string) => void) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return {
    busy,
    errors,
    run: async (work: (key: string) => Promise<{ message: string }>) => {
      setBusy(true);
      setErrors({});
      try {
        onDone((await work(key)).message);
      } catch (failure) {
        const next = fieldErrors(failure);
        // Only an unconfirmed request keeps its key.
        if (!next.form?.includes('couldn’t be confirmed'))
          setKey(crypto.randomUUID());
        setErrors(next);
        setBusy(false);
      }
    },
  };
}
function Form({
  title,
  change,
  submit,
  danger,
  ready = true,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  change: ReturnType<typeof useChange>;
  submit: string;
  danger?: boolean;
  ready?: boolean;
  onClose: () => void;
  onSubmit: (key: string) => Promise<{ message: string }>;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      title={title}
      onClose={change.busy ? () => undefined : onClose}
    >
      <form
        className="lv-setup-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void change.run(onSubmit);
        }}
      >
        {children}
        {!!Object.keys(change.errors).length && (
          <p className="lv-setup-error" role="alert">
            {Object.values(change.errors).join(' ')}
          </p>
        )}
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button variant="secondary" onClick={onClose} disabled={change.busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={danger ? 'danger' : 'primary'}
            busy={change.busy}
            disabled={!ready}
          >
            {submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
type Props = {
  invoice: InvoiceView;
  client: InvoicesClient;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function RefundDialog({
  invoice: live,
  client,
  lineId,
  onClose,
  onDone,
}: Props & { lineId?: string }) {
  // A refresh behind the dialog never changes what is being confirmed.
  const [invoice] = useState(live);
  const change = useChange(onDone);
  const open = invoice.lines.filter((l) => l.totalKobo > l.refundedKobo);
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      open
        .filter((l) => !lineId || l.id === lineId)
        .map((l) => [l.id, String((l.totalKobo - l.refundedKobo) / 100)]),
    ),
  );
  const [reason, setReason] = useState<RefundReason | ''>('');
  const [note, setNote] = useState('');
  const parts = Object.entries(picked).map(([id, text]) => ({
    id,
    amountKobo: nairaValue(text) ?? 0,
  }));
  const total = parts.reduce((s, p) => s + p.amountKobo, 0);
  const over = open.find((l) => {
    const part = parts.find((p) => p.id === l.id);
    return part && part.amountKobo > l.totalKobo - l.refundedKobo;
  });
  const problem = over
    ? `${over.lotNumber} has ${money(over.totalKobo - over.refundedKobo)} left to refund.`
    : parts.some((p) => p.amountKobo < 1)
      ? 'Enter an amount for each chosen item.'
      : '';
  const left = open.reduce((s, l) => s + l.totalKobo - l.refundedKobo, 0);
  return (
    <Form
      title={`Request a refund · ${invoice.number}`}
      change={change}
      submit={`Request refund of ${money(total)}`}
      ready={parts.length > 0 && !problem && !!reason && note.trim().length > 2}
      onClose={onClose}
      onSubmit={(idempotencyKey) =>
        client.requestRefund({
          idempotencyKey,
          invoiceId: invoice.id,
          reason: reason as RefundReason,
          note,
          lines: parts.map((p) => ({ lineId: p.id, amountKobo: p.amountKobo })),
        })
      }
    >
      <p className="lv-setup-muted">
        Someone else must approve this. The money then goes to the buyer’s
        wallet.
      </p>
      <ul className="lv-inv-refund-lines">
        {open.map((l) => (
          <li key={l.id}>
            <label>
              <input
                type="checkbox"
                checked={l.id in picked}
                onChange={(e) =>
                  setPicked((old) => {
                    const next = { ...old };
                    if (e.target.checked)
                      next[l.id] = String((l.totalKobo - l.refundedKobo) / 100);
                    else delete next[l.id];
                    return next;
                  })
                }
              />
              <span>
                {l.title}
                <small>
                  {l.lotNumber} · {money(l.totalKobo - l.refundedKobo)} left
                </small>
              </span>
            </label>
            {l.id in picked && (
              <Input
                label={`Amount for ${l.lotNumber} (₦)`}
                inputMode="decimal"
                prefix="₦"
                value={picked[l.id] ?? ''}
                onChange={(e) =>
                  /^[0-9]*(?:\.[0-9]{0,2})?$/.test(e.target.value) &&
                  setPicked((old) => ({ ...old, [l.id]: e.target.value }))
                }
              />
            )}
          </li>
        ))}
      </ul>
      <p>
        {total === left
          ? 'This is a full refund: the pickup will be cancelled.'
          : 'This is a partial refund: the buyer keeps the item.'}
      </p>
      <Select
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value as RefundReason)}
      >
        <option value="">Choose a reason</option>
        {refundReasons.map((r) => (
          <option key={r} value={r}>
            {refundReasonLabels[r]}
          </option>
        ))}
      </Select>
      <Textarea
        label="Note for the approver"
        value={note}
        maxLength={500}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
      />
      {problem && (
        <p className="lv-setup-error" role="alert">
          {problem}
        </p>
      )}
    </Form>
  );
}

export function DecideDialog({
  refund: live,
  approve,
  client,
  onClose,
  onDone,
}: Omit<Props, 'invoice'> & { refund: InvoiceRefund; approve: boolean }) {
  const [refund] = useState(live);
  const change = useChange(onDone);
  const [note, setNote] = useState('');
  const [typed, setTyped] = useState('');
  return (
    <Form
      title={approve ? 'Approve this refund?' : 'Reject this refund?'}
      change={change}
      submit={approve ? `Approve ${money(refund.amountKobo)}` : 'Reject refund'}
      danger={!approve}
      ready={
        note.trim().length > 2 &&
        (!approve || confirmationMatches(typed, 'APPROVE'))
      }
      onClose={onClose}
      onSubmit={(idempotencyKey) =>
        client.decideRefund({
          idempotencyKey,
          requestId: refund.id,
          approve,
          note,
        })
      }
    >
      <p>
        {refund.requestedBy} asked to refund <b>{money(refund.amountKobo)}</b>{' '}
        to {refund.buyerName} on {refund.invoiceNumber}:{' '}
        {refundReasonLabels[refund.reason].toLowerCase()}.
        {refund.note && ` “${refund.note}”`}
      </p>
      <Textarea
        label="Note"
        value={note}
        maxLength={500}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
      />
      {approve && (
        <Input
          label="Type APPROVE to pay this to the buyer’s wallet"
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
      )}
    </Form>
  );
}

export function DisputeDialog({ invoice, client, onClose, onDone }: Props) {
  const change = useChange(onDone);
  const [message, setMessage] = useState('');
  return (
    <Form
      title={`Open a dispute · ${invoice.number}`}
      change={change}
      submit="Open dispute"
      ready={message.trim().length >= 10}
      onClose={onClose}
      onSubmit={(idempotencyKey) =>
        client.dispute({ idempotencyKey, invoiceId: invoice.id, message })
      }
    >
      <p className="lv-setup-muted">
        This opens a support ticket with {invoice.buyer.name}, who gets your
        message by email and in-app. The invoice shows Disputed until the ticket
        is resolved.
      </p>
      <Textarea
        label="Message to the buyer"
        value={message}
        maxLength={1000}
        rows={3}
        onChange={(e) => setMessage(e.target.value)}
      />
    </Form>
  );
}
export function NoteDialog({ invoice, client, onClose, onDone }: Props) {
  const change = useChange(onDone);
  const [body, setBody] = useState('');
  return (
    <Form
      title={`Add a note · ${invoice.number}`}
      change={change}
      submit="Add note"
      ready={!!body.trim()}
      onClose={onClose}
      onSubmit={(idempotencyKey) =>
        client.addNote({ idempotencyKey, invoiceId: invoice.id, body })
      }
    >
      <Textarea
        label="Internal note"
        hint="Staff only. The buyer never sees this."
        value={body}
        maxLength={1000}
        rows={3}
        onChange={(e) => setBody(e.target.value)}
      />
    </Form>
  );
}
export function ResendDialog({ invoice, client, onClose, onDone }: Props) {
  const change = useChange(onDone);
  return (
    <Form
      title={`Send ${invoice.number} again?`}
      change={change}
      submit="Send invoice"
      onClose={onClose}
      onSubmit={(idempotencyKey) =>
        client.resend({ idempotencyKey, invoiceId: invoice.id })
      }
    >
      <p>
        {invoice.buyer.name} gets an email and an in-app message with a link to
        this invoice. You can send it 3 times an hour.
      </p>
    </Form>
  );
}
export function ReceiptDialog({
  invoice,
  client,
  onClose,
}: Omit<Props, 'onDone'>) {
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(invoice.issuedAt.slice(0, 10));
  const [to, setTo] = useState(today);
  const change = useChange(onClose);
  return (
    <Form
      title={`Combined receipt · ${invoice.buyer.name}`}
      change={change}
      submit="Download receipt"
      ready={!!from && !!to}
      onClose={onClose}
      onSubmit={async () => {
        saveFile(
          await client.receipt(invoice.number, from, to),
          `receipt-${from}-to-${to}.pdf`,
        );
        return { message: '' };
      }}
    >
      <p className="lv-setup-muted">
        Everything this buyer paid for between these dates, on one PDF.
      </p>
      <div className="lv-setup-grid lv-setup-grid--2">
        <Input
          label="From"
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
    </Form>
  );
}
