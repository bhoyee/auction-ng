'use client';
import { useState } from 'react';
import type { InvoiceRefund, InvoiceView } from '@auction-ng/shared';
import type { InvoicesClient } from '@auction-ng/api-client/invoices';
import { fieldErrors } from '../batches/batch-ui';
import {
  DecideDialog,
  DisputeDialog,
  NoteDialog,
  ReceiptDialog,
  RefundDialog,
  ResendDialog,
} from './invoice-dialogs';
import { openFile, saveFile } from './invoice-ui';

export type InvoiceAction =
  | { kind: 'refund'; lineId?: string }
  | { kind: 'decide'; refund: InvoiceRefund; approve: boolean }
  | { kind: 'dispute' | 'note' | 'resend' | 'receipt' };

/** The dialogs, downloads and messages the drawer and the page share. */
export function useInvoiceActions(
  invoice: InvoiceView | undefined,
  client: InvoicesClient,
  onChanged: () => void,
) {
  const [action, setAction] = useState<InvoiceAction>();
  const [toast, setToast] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => setAction(undefined);
  const done = (message: string) => {
    close();
    setToast(message);
    onChanged();
  };
  async function file(print: boolean) {
    if (!invoice) return;
    setBusy(true);
    setProblem('');
    try {
      const blob = await client.pdf(invoice.number);
      if (print) openFile(blob);
      else saveFile(blob, `${invoice.number}.pdf`);
    } catch (failure) {
      setProblem(Object.values(fieldErrors(failure))[0] ?? '');
    } finally {
      setBusy(false);
    }
  }
  const props = invoice && { invoice, client, onClose: close, onDone: done };
  return {
    busy,
    open: (next: InvoiceAction) => {
      setToast('');
      setAction(next);
    },
    download: () => void file(false),
    print: () => void file(true),
    dialogOpen: !!action,
    messages: (
      <>
        {toast && (
          <p className="lv-setup-toast" role="status">
            {toast}
          </p>
        )}
        {problem && (
          <p className="lv-setup-alert" role="alert">
            {problem}
          </p>
        )}
      </>
    ),
    dialogs: props && (
      <>
        {action?.kind === 'refund' && (
          <RefundDialog {...props} lineId={action.lineId} />
        )}
        {action?.kind === 'decide' && (
          <DecideDialog
            client={client}
            refund={action.refund}
            approve={action.approve}
            onClose={close}
            onDone={done}
          />
        )}
        {action?.kind === 'dispute' && <DisputeDialog {...props} />}
        {action?.kind === 'note' && <NoteDialog {...props} />}
        {action?.kind === 'resend' && <ResendDialog {...props} />}
        {action?.kind === 'receipt' && <ReceiptDialog {...props} />}
      </>
    ),
  };
}

/** A refund waiting for someone else's decision. */
export function PendingRefund({
  invoice,
  onDecide,
}: {
  invoice: InvoiceView;
  onDecide: (refund: InvoiceRefund, approve: boolean) => void;
}) {
  const refund = invoice.refunds.find((r) => r.status === 'requested');
  if (!refund) return null;
  return (
    <section className="lv-inv-pending" aria-label="Refund waiting">
      <p>
        <b>
          {refund.step === 'admin'
            ? 'Refund waiting for an admin (2 of 2)'
            : 'Refund waiting for a manager (1 of 2)'}
        </b>
        {refund.requestedBy} asked for{' '}
        {`₦${(refund.amountKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
        .{refund.note && ` “${refund.note}”`}
        {refund.firstApprovedBy &&
          ` ${refund.firstApprovedBy} approved it${refund.firstNote ? `: “${refund.firstNote}”` : '.'}`}
      </p>
      {refund.waiting && <small>{refund.waiting}</small>}
      {(refund.canApprove || refund.canReject) && (
        <div>
          {refund.canApprove && (
            <button
              type="button"
              className="agn-button agn-button--primary agn-button--small"
              onClick={() => onDecide(refund, true)}
            >
              Approve
            </button>
          )}
          <button
            type="button"
            className="agn-button agn-button--secondary agn-button--small"
            onClick={() => onDecide(refund, false)}
          >
            Reject
          </button>
        </div>
      )}
    </section>
  );
}
