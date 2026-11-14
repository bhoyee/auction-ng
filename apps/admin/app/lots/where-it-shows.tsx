'use client';
import { useState } from 'react';
import type { LotEditor } from '@auction-ng/shared';
import { ApiError } from '@auction-ng/api-client/auth';
import type { createCatalogueClient } from '@auction-ng/api-client';
import type { LotsClient } from '@auction-ng/api-client/lots';
import { Button } from '@auction-ng/ui/web/button';
import { CalendarClock } from '@auction-ng/ui/web/icons';

type Catalogue = ReturnType<typeof createCatalogueClient>;

/**
 * Where a lot shows to buyers (owner decision 2026-11-14): Top deals, and
 * Upcoming either with a go-live time (Schedule) or "Coming soon, date to be
 * announced" (view and watch only). For staff who can publish.
 */
export function WhereItShows({
  editor,
  client,
  catalogue,
  blocking,
  dirty,
  run,
  onEditor,
  onSchedule,
}: {
  editor: LotEditor | undefined;
  client: LotsClient;
  catalogue: Catalogue;
  /** Hard rules still open in Ready to publish. */
  blocking: number;
  /** Unsaved form changes: they are saved before a change here. */
  dirty: boolean;
  /** The form's one-at-a-time queue (autosave, photos, buttons). */
  run: (task: () => Promise<void>) => Promise<void>;
  onEditor: (editor: LotEditor) => void;
  onSchedule: () => void;
}) {
  const [busy, setBusy] = useState<'top' | 'soon'>();
  // Show the choice at once; it falls back if the save is refused.
  const [wantTop, setWantTop] = useState<boolean>();
  const [wantSoon, setWantSoon] = useState<boolean>();
  const [error, setError] = useState('');
  const [order, setOrder] = useState(String(editor?.topDealOrder ?? 0));
  const stage = editor?.stage;
  const featurable =
    stage === 'draft' || stage === 'scheduled' || stage === 'live';

  const explain = (failure: unknown, fallback: string) =>
    failure instanceof ApiError && failure.status === 403
      ? 'Your role can’t change where lots show. Ask an admin.'
      : failure instanceof ApiError && failure.status === 409
        ? 'This lot changed. Reload the page and try again.'
        : failure instanceof ApiError && failure.detail
          ? failure.detail
          : fallback;

  function setTopDeal(isTopDeal: boolean, topDealOrder: number) {
    if (!editor) return;
    setBusy('top');
    setWantTop(isTopDeal);
    setError('');
    void run(async () => {
      try {
        const latest = await client.editor(editor.id);
        await catalogue.editTopDeal(editor.id, {
          isTopDeal,
          topDealOrder,
          expectedUpdatedAt: latest.updatedAt,
        });
        onEditor(await client.editor(editor.id));
      } catch (failure) {
        setError(explain(failure, 'Top deals didn’t save. Try again.'));
      } finally {
        setBusy(undefined);
        setWantTop(undefined);
      }
    });
  }

  function setComingSoon(comingSoon: boolean) {
    if (!editor) return;
    setBusy('soon');
    setWantSoon(comingSoon);
    setError('');
    void run(async () => {
      try {
        const latest = await client.editor(editor.id);
        onEditor(
          await client.comingSoon(editor.id, {
            comingSoon,
            expectedUpdatedAt: latest.updatedAt,
            idempotencyKey: crypto.randomUUID(),
          }),
        );
      } catch (failure) {
        setError(explain(failure, 'Upcoming didn’t save. Try again.'));
      } finally {
        setBusy(undefined);
        setWantSoon(undefined);
      }
    });
  }

  if (!editor)
    return (
      <section
        className="lv-lots-card lv-lot-section"
        aria-labelledby="where-h"
      >
        <header>
          <h2 id="where-h">Where it shows</h2>
        </header>
        <p className="lv-lot-hint">
          Save the draft first, then choose Top deals or Upcoming.
        </p>
      </section>
    );

  const orderNumber = Math.max(0, Math.min(9999, Number(order) || 0));
  return (
    <section className="lv-lots-card lv-lot-section" aria-labelledby="where-h">
      <header>
        <h2 id="where-h">Where it shows</h2>
      </header>
      <div className="lv-lot-where">
        <h3>Top deals</h3>
        <label className="lv-lot-where-check">
          <input
            type="checkbox"
            checked={wantTop ?? editor.isTopDeal}
            disabled={!featurable || !!busy}
            onChange={(e) => setTopDeal(e.target.checked, orderNumber)}
          />
          <span>
            Feature in Top deals
            <small>
              {stage === 'live'
                ? 'Shows in Top deals while it’s live.'
                : 'Shows in Top deals once it’s live.'}
            </small>
          </span>
        </label>
        {(wantTop ?? editor.isTopDeal) && (
          <div className="lv-lot-where-order">
            <label htmlFor="top-order">Display order</label>
            <input
              id="top-order"
              className="agn-input"
              inputMode="numeric"
              value={order}
              disabled={!!busy}
              onChange={(e) => setOrder(e.target.value.replace(/\D/g, ''))}
            />
            <Button
              variant="secondary"
              size="small"
              busy={busy === 'top'}
              disabled={orderNumber === editor.topDealOrder}
              onClick={() => setTopDeal(true, orderNumber)}
            >
              Save order
            </Button>
          </div>
        )}
      </div>
      <div className="lv-lot-where">
        <h3>Upcoming</h3>
        {stage === 'draft' ? (
          <>
            <label className="lv-lot-where-check">
              <input
                type="checkbox"
                checked={wantSoon ?? editor.comingSoon}
                disabled={
                  !!busy || dirty || (!editor.comingSoon && blocking > 0)
                }
                onChange={(e) => setComingSoon(e.target.checked)}
              />
              <span>
                Coming soon, date to be announced
                <small>
                  {editor.comingSoon
                    ? 'Buyers see it in Upcoming and can watch it. No pre-bids until you set a time.'
                    : dirty
                      ? 'Save your changes first.'
                      : blocking > 0
                        ? `Finish the ${blocking} ${blocking === 1 ? 'item' : 'items'} in Ready to publish first.`
                        : 'Show it in Upcoming without a date. Buyers can watch it; no pre-bids.'}
                </small>
              </span>
            </label>
            <Button
              variant="secondary"
              size="small"
              disabled={!!busy || blocking > 0}
              onClick={onSchedule}
            >
              <CalendarClock size={16} aria-hidden="true" /> Set a go-live time
            </Button>
          </>
        ) : stage === 'scheduled' ? (
          <p className="lv-lot-hint">
            Scheduled: buyers see it in Upcoming, with its go-live time, until
            it goes live.
          </p>
        ) : (
          <p className="lv-lot-hint">
            Only drafts and scheduled lots show in Upcoming.
          </p>
        )}
      </div>
      {error && (
        <p className="lv-lots-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
