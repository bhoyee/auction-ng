'use client';
import { useCallback, useEffect, useState } from 'react';
import { createSavedSearchClient } from '@auction-ng/api-client/saved-searches';
import { createCatalogueClient } from '@auction-ng/api-client/catalogue';
import {
  savedSearchPath,
  savedSearchRules,
} from '@auction-ng/shared/saved-search-schemas';
import { formatNaira } from '@auction-ng/shared/money';
import { Button } from '@auction-ng/ui/web/button';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerSkeleton } from '@auction-ng/ui/web/buyer';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { Toast } from '@auction-ng/ui/web/toast';
import { Search, Trash2 } from '@auction-ng/ui/web/icons';
import { apiUrl, useBuyer } from '../lib/session';
import { useOnline } from '../lib/network';
import { SAVED_SEARCHES_CHANGED } from '../lib/saved-search-count';

type Page = Awaited<
  ReturnType<ReturnType<typeof createSavedSearchClient>['list']>
>;
type Item = Page['items'][number];

function changed() {
  window.dispatchEvent(new Event(SAVED_SEARCHES_CHANGED));
}

/** Words and filters in plain English: "Phones · Ikeja · up to ₦50,000". */
function filtersLabel(item: Item, names: Map<string, string>) {
  return [
    item.categoryId ? (names.get(item.categoryId) ?? 'One category') : null,
    item.locationId ? (names.get(item.locationId) ?? 'One pickup point') : null,
    item.maxPriceKobo != null
      ? `up to ${formatNaira(item.maxPriceKobo)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function SavedSearches() {
  const { tokens, deviceId } = useBuyer();
  const online = useOnline();
  const [page, setPage] = useState<Page>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<{
    text: string;
    tone: 'success' | 'error';
  }>();
  const [names, setNames] = useState(new Map<string, string>());
  const client =
    tokens && deviceId
      ? createSavedSearchClient(apiUrl, {
          accessToken: tokens.accessToken,
          deviceId,
        })
      : undefined;
  const accessToken = tokens?.accessToken;

  const load = useCallback(async () => {
    if (!accessToken || !deviceId) return;
    setFailed(false);
    try {
      setPage(
        await createSavedSearchClient(apiUrl, { accessToken, deviceId }).list(),
      );
    } catch {
      setFailed(true);
    }
  }, [accessToken, deviceId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    // Names for category and pickup-point filters; ids are shown otherwise.
    const catalogue = createCatalogueClient(apiUrl);
    void Promise.all([
      catalogue.categories({ limit: 50 }),
      catalogue.locations({ limit: 50 }),
    ])
      .then(([categories, locations]) =>
        setNames(
          new Map(
            [...categories.items, ...locations.items].map((row) => [
              row.id,
              row.name,
            ]),
          ),
        ),
      )
      .catch(() => {});
  }, []);

  async function act(
    id: string,
    run: () => Promise<unknown>,
    success: string,
    update: (current: Page) => Page,
  ) {
    if (!online) {
      setMessage({
        text: 'You’re offline. Reconnect, then try again.',
        tone: 'error',
      });
      return;
    }
    setBusy(id);
    try {
      await run();
      setPage((current) => (current ? update(current) : current));
      setMessage({ text: success, tone: 'success' });
      changed();
    } catch {
      setMessage({
        text: 'That didn’t save. Check your connection and try again.',
        tone: 'error',
      });
    } finally {
      setBusy(undefined);
    }
  }

  const description =
    'We tell you in your notifications when a new deal matches, and email you a summary at 8:00 am.';
  if (failed)
    return (
      <BuyerPage title="Saved searches" description={description}>
        <ErrorState
          title="We couldn’t load your saved searches"
          onRetry={() => void load()}
        >
          {online
            ? 'Check your connection and try again.'
            : 'You’re offline. Reconnect, then try again.'}
        </ErrorState>
      </BuyerPage>
    );
  if (!page || !client)
    return (
      <BuyerPage title="Saved searches" description={description}>
        <BuyerSkeleton />
      </BuyerPage>
    );
  if (!page.enabled)
    return (
      <BuyerPage title="Saved searches">
        <EmptyState title="Saved searches are paused">
          Search alerts are switched off for now. Your searches are kept.
        </EmptyState>
      </BuyerPage>
    );
  return (
    <BuyerPage title="Saved searches" description={description}>
      {message && (
        <Toast tone={message.tone} onClose={() => setMessage(undefined)}>
          {message.text}
        </Toast>
      )}
      <div className="agn-saved-searches">
        <div className="agn-saved-searches-bar">
          <p>
            {page.items.length} of {page.limit} saved
          </p>
          <label className="agn-saved-switch">
            <input
              type="checkbox"
              checked={page.digest}
              disabled={busy === 'digest'}
              onChange={(event) => {
                const digest = event.target.checked;
                void act(
                  'digest',
                  () => client.setDigest(digest),
                  digest
                    ? 'Daily email turned on.'
                    : 'Daily email turned off. Alerts still appear in your notifications.',
                  (current) => ({ ...current, digest }),
                );
              }}
            />
            <span>Daily email at 8:00 am</span>
          </label>
        </div>
        {page.items.length === 0 ? (
          <EmptyState
            title="No saved searches yet"
            action={
              <a className="agn-button agn-button--secondary" href="/">
                Browse deals
              </a>
            }
          >
            Search for something you want, then choose “Save search & notify
            me”. We’ll tell you when a matching deal goes live.
          </EmptyState>
        ) : (
          <ul className="agn-saved-list">
            {page.items.map((item) => {
              const filters = filtersLabel(item, names);
              const path = savedSearchPath(item);
              return (
                <li key={item.id} className="agn-saved-item">
                  <div className="agn-saved-item-main">
                    <Search size={20} aria-hidden="true" />
                    <div>
                      <h2>
                        “{item.query}”
                        {item.newMatches > 0 && (
                          <span className="agn-saved-new">
                            {item.newMatches} new
                          </span>
                        )}
                      </h2>
                      {filters && <p>{filters}</p>}
                    </div>
                  </div>
                  <label className="agn-saved-switch">
                    <input
                      type="checkbox"
                      checked={item.instantEmail}
                      disabled={busy === item.id}
                      onChange={(event) => {
                        const instantEmail = event.target.checked;
                        void act(
                          item.id,
                          () => client.setInstantEmail(item.id, instantEmail),
                          instantEmail
                            ? `We’ll email you straight away (up to ${savedSearchRules.instantPerDay} emails a day).`
                            : 'Straight-away emails turned off.',
                          (current) => ({
                            ...current,
                            items: current.items.map((row) =>
                              row.id === item.id
                                ? { ...row, instantEmail }
                                : row,
                            ),
                          }),
                        );
                      }}
                    />
                    <span>Email me straight away</span>
                  </label>
                  <div className="agn-saved-actions">
                    <a
                      className="agn-button agn-button--primary agn-button--small"
                      href={path}
                      onClick={() => {
                        if (item.newMatches > 0)
                          void client
                            .viewed(item.id)
                            .then(changed)
                            .catch(() => {});
                      }}
                    >
                      View deals
                    </a>
                    <Button
                      variant="ghost"
                      size="small"
                      busy={busy === `remove:${item.id}`}
                      aria-label={`Remove saved search “${item.query}”`}
                      onClick={() =>
                        void act(
                          `remove:${item.id}`,
                          () => client.remove(item.id),
                          `Removed “${item.query}”.`,
                          (current) => ({
                            ...current,
                            items: current.items.filter(
                              (row) => row.id !== item.id,
                            ),
                          }),
                        )
                      }
                    >
                      <Trash2 size={18} aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="agn-saved-note">
          Straight-away emails are limited to {savedSearchRules.instantPerDay} a
          day. Any more go into your 8:00 am email.
        </p>
      </div>
    </BuyerPage>
  );
}
