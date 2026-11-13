'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LotsClient } from '@auction-ng/api-client/lots';

type Label = {
  id: string;
  lotNumber: string;
  title: string;
  binCode: string | null;
  locationCode: string;
  svg: string;
};

/**
 * 50 × 30 mm lot labels: QR of the lot ID, title, bin and location code, one
 * label per page so a label printer (or "Save as PDF") gets one file.
 */
export function useLotLabels(client: LotsClient) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!labels.length) return;
    const done = () => setLabels([]);
    window.addEventListener('afterprint', done);
    // Let the sheet render before opening the print dialog.
    const timer = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [labels]);
  async function print(ids: string[]) {
    setError('');
    try {
      const [{ items }, QR] = await Promise.all([
        client.labels(ids),
        import('qrcode'),
      ]);
      setLabels(
        await Promise.all(
          items.map(async (l) => ({
            ...l,
            svg: await QR.toString(l.lotNumber, {
              type: 'svg',
              margin: 0,
              width: 96,
            }),
          })),
        ),
      );
    } catch {
      setError(
        'Labels couldn’t be prepared. Check your connection and try again.',
      );
    }
  }
  const sheet =
    labels.length > 0
      ? createPortal(
          <div className="lv-lot-labels" aria-hidden="true">
            {labels.map((l) => (
              <figure key={l.id} className="lv-lot-label">
                <span
                  // SVG made locally by the qrcode library from our own lot ID.
                  dangerouslySetInnerHTML={{ __html: l.svg }}
                />
                <div>
                  <strong>{l.lotNumber}</strong>
                  <span>{l.title}</span>
                  <small>
                    {l.locationCode} · {l.binCode ?? 'no bin'}
                  </small>
                </div>
              </figure>
            ))}
          </div>,
          document.body,
        )
      : null;
  return { print, sheet, error };
}
