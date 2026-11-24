'use client';
import { useCallback, useState } from 'react';
import { ApiError } from '@auction-ng/api-client/auth';
import { createBuyerInvoicesClient } from '@auction-ng/api-client/invoices';
import { formatNaira } from '@auction-ng/shared/money';
import { BuyerPanel } from '@auction-ng/ui/web/buyer';
import { Button } from '@auction-ng/ui/web/button';
import { Download } from '@auction-ng/ui/web/icons';
import { Input } from '@auction-ng/ui/web/input';
import { apiUrl, useBuyer } from '../lib/session';
import { usePrivateRead } from '../lib/private-read';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
const why = (failure: unknown) =>
  failure instanceof ApiError && failure.status === 429
    ? 'Too many downloads. Wait a few minutes and try again.'
    : failure instanceof ApiError && failure.detail
      ? failure.detail
      : 'This could not be downloaded. Check your connection and try again.';

/** Download PDF, and any money already returned to the wallet. */
export function InvoiceFiles({ id, number }: { id: string; number: string }) {
  const { tokens, deviceId } = useBuyer();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const read = useCallback(
    (credentials: { accessToken: string; deviceId: string }) =>
      createBuyerInvoicesClient(apiUrl, credentials).refunds(id),
    [id],
  );
  const { data } = usePrivateRead(read);
  async function download() {
    if (!tokens) return;
    setBusy(true);
    setProblem('');
    try {
      const client = createBuyerInvoicesClient(apiUrl, {
        accessToken: tokens.accessToken,
        deviceId,
      });
      save(await client.pdf(id), `${number}.pdf`);
    } catch (failure) {
      setProblem(why(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="agn-invoice-files">
        <Button variant="secondary" busy={busy} onClick={() => void download()}>
          <Download size={18} aria-hidden="true" /> Download PDF
        </Button>
        {problem && <p role="alert">{problem}</p>}
      </div>
      {!!data?.refunds.length && (
        <BuyerPanel>
          <h2>Returned to your wallet</h2>
          <ul className="agn-invoice-refunds">
            {data.refunds.map((r) => (
              <li key={r.at + r.amountKobo}>
                <span>
                  {new Date(r.at).toLocaleDateString('en-NG', {
                    timeZone: 'Africa/Lagos',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <b>{formatNaira(r.amountKobo)}</b>
              </li>
            ))}
            {data.refunds.length > 1 && (
              <li>
                <span>Total returned</span>
                <b>{formatNaira(data.refundedKobo)}</b>
              </li>
            )}
          </ul>
        </BuyerPanel>
      )}
    </>
  );
}

/** One PDF for everything paid between two dates. */
export function CombinedReceipt() {
  const { tokens, deviceId } = useBuyer();
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  return (
    <BuyerPanel>
      <h2>Combined receipt</h2>
      <p>Everything you paid for between two dates, on one PDF.</p>
      <form
        className="agn-invoice-receipt"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!tokens) return;
          setBusy(true);
          setProblem('');
          try {
            const client = createBuyerInvoicesClient(apiUrl, {
              accessToken: tokens.accessToken,
              deviceId,
            });
            save(
              await client.receipt(from, to),
              `GiddyDeal-receipt-${from}-to-${to}.pdf`,
            );
          } catch (failure) {
            setProblem(why(failure));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          label="From"
          type="date"
          value={from}
          max={to}
          required
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={to}
          min={from}
          max={today}
          required
          onChange={(e) => setTo(e.target.value)}
        />
        <Button type="submit" busy={busy}>
          Download receipt
        </Button>
      </form>
      {problem && <p role="alert">{problem}</p>}
    </BuyerPanel>
  );
}
