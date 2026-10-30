'use client';
import { useEffect, useRef, useState } from 'react';
import { createCatalogueClient } from '@auction-ng/api-client';
import { ApiError } from '@auction-ng/api-client/auth';
import { createStaffAuthClient } from '@auction-ng/api-client/staff-auth';
import { webRefreshSchema, type TokenResponse } from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import {
  TopDealManager,
  type TopDealRow,
} from '@auction-ng/ui/web/top-deal-manager';
import { StaffSignIn } from '@auction-ng/ui/web/staff-sign-in';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export function StaffWorkspace() {
  const [device, setDevice] = useState('');
  const [session, setSession] = useState<TokenResponse | null>(null);
  const currentSession = useRef<TokenResponse | null>(null);
  currentSession.current = session;
  const userId = session?.user.id;
  const role = session?.user.role;
  const [reloadVersion, setReloadVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(true);
  const [lots, setLots] = useState<TopDealRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [filter, setFilter] = useState('');
  const [unsoldOnly, setUnsoldOnly] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  useEffect(() => {
    let active = true;
    let id: string = crypto.randomUUID();
    try {
      const stored = localStorage.getItem('auction-ng-staff-device');
      if (
        stored &&
        webRefreshSchema.safeParse({ client: 'web', deviceId: stored }).success
      )
        id = stored;
      localStorage.setItem('auction-ng-staff-device', id);
    } catch {
      /* Keep device identity in memory if storage is blocked. */
    }
    setDevice(id);
    void createStaffAuthClient(apiUrl, id)
      .refresh()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      active = false;
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);
  useEffect(() => {
    if (!session || !device) return;
    let active = true;
    const timer = setTimeout(
      () => {
        void createStaffAuthClient(apiUrl, device)
          .refresh()
          .then((value) => {
            if (active) setSession(value);
          })
          .catch(() => {
            if (active) {
              setSession(null);
              setLots([]);
              setError('Your staff session expired. Sign in again.');
            }
          });
      },
      Math.max(1000, (session.expiresInSeconds - 60) * 1000),
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session, device]);
  useEffect(() => {
    const credentials = currentSession.current;
    if (!credentials || !device) return;
    let active = true;
    setBusy(true);
    setError('');
    setMessage('');
    void createCatalogueClient(apiUrl, {
      accessToken: credentials.accessToken,
      deviceId: device,
    })
      .merchandisingLots({
        unsoldOnly,
        limit: 24,
        cursor,
        ...(filter ? { reference: filter } : {}),
      })
      .then((page) => {
        if (active) {
          setLots(page.items);
          setNext(page.nextCursor);
        }
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          setSession(null);
          setLots([]);
        }
        setError(
          cause instanceof ApiError && cause.status === 403
            ? 'Only administrators can manage Top Deals.'
            : 'Lots could not be loaded. Check your connection and reload.',
        );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [userId, role, device, cursor, filter, reloadVersion, unsoldOnly]);
  return (
    <main className="agn-staff-workspace">
      <header className="agn-staff-header">
        <a href="/" className="agn-wordmark">
          Auction<span>NG</span>
        </a>
        <span>Staff workspace</span>
        {session && (
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await createStaffAuthClient(apiUrl, device).logout();
                setSession(null);
                setLots([]);
                setError('');
              } catch {
                setError(
                  'Sign out failed. Check your connection and try again.',
                );
              }
            }}
          >
            Sign out
          </Button>
        )}
      </header>
      {!online && (
        <p role="status" className="agn-admin-notice">
          You are offline. Reconnect before saving changes.
        </p>
      )}
      {!ready ? (
        <p role="status">Checking staff session...</p>
      ) : !session ? (
        <StaffSignIn
          busy={busy}
          disabled={!online || !device}
          error={error}
          onSignIn={async (email, password, code) => {
            setBusy(true);
            setError('');
            try {
              const value = await createStaffAuthClient(apiUrl, device).signIn(
                email,
                password,
                code,
              );
              setSession(value);
              setCursor(undefined);
              setHistory([]);
            } catch (cause) {
              setError(
                cause instanceof ApiError && cause.status === 429
                  ? 'Too many sign-in attempts. Wait 15 minutes and try again.'
                  : 'Check your staff email, password and current authenticator code, then try again.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <>
          <div className="agn-admin-heading">
            <div>
              <h1>Top Deals</h1>
              <p>Choose the lots buyers see, and set their display order.</p>
            </div>
            <Button
              variant="secondary"
              disabled={busy || !online}
              onClick={() => setReloadVersion((value) => value + 1)}
            >
              Reload lots
            </Button>
          </div>
          <form
            className="agn-admin-search"
            onSubmit={(event) => {
              event.preventDefault();
              setFilter(reference.trim());
              setCursor(undefined);
              setHistory([]);
            }}
          >
            <label className="agn-consent">
              <input
                type="checkbox"
                checked={unsoldOnly}
                onChange={(event) => {
                  setUnsoldOnly(event.target.checked);
                  setCursor(undefined);
                  setHistory([]);
                }}
              />
              Unsold awaiting review
            </label>
            <Input
              label="Find by lot reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Enter the full lot reference"
            />
            <Button type="submit" disabled={busy || !online}>
              Find lot
            </Button>
            {filter && (
              <Button
                variant="ghost"
                onClick={() => {
                  setFilter('');
                  setReference('');
                  setCursor(undefined);
                  setHistory([]);
                }}
              >
                Clear search
              </Button>
            )}
          </form>
          <p className="agn-admin-notice">
            Only open auctions appear in Top Deals. At 20 minutes remaining they
            move to Closing now. Ended and cancelled lots disappear
            automatically.
          </p>
          {error && (
            <p role="alert" className="agn-field-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="agn-admin-success">
              {message}
            </p>
          )}
          {busy && <p role="status">Loading lots...</p>}
          {!busy && !error && lots.length === 0 && (
            <p className="agn-admin-notice">
              {filter
                ? 'No lot matches that reference. Copy the full reference from the auction.'
                : 'No lots have been added yet.'}
            </p>
          )}
          <TopDealManager
            lots={lots}
            disabled={busy || !online || Boolean(error)}
            onFixedPrice={async (lot, fixedPriceKobo) => {
              try {
                const saved = await createCatalogueClient(apiUrl, {
                  accessToken: session.accessToken,
                  deviceId: device,
                }).editFixedPrice(lot.id, {
                  fixedPriceKobo,
                  expectedUpdatedAt: lot.updatedAt,
                });
                setLots((previous) =>
                  previous.map((row) => (row.id === saved.id ? saved : row)),
                );
                setMessage('Fixed purchase price saved.');
                return undefined;
              } catch (cause) {
                if (cause instanceof ApiError && cause.status === 401) {
                  setSession(null);
                  setLots([]);
                }
                return 'Could not save the price. Reload to check whether the item changed or is reserved.';
              }
            }}
            onRelist={async (lot, autoRelistEnabled) => {
              try {
                const saved = await createCatalogueClient(apiUrl, {
                  accessToken: session.accessToken,
                  deviceId: device,
                }).editAutoRelist(lot.id, {
                  autoRelistEnabled,
                  expectedUpdatedAt: lot.updatedAt,
                });
                setLots((previous) =>
                  previous.map((row) => (row.id === saved.id ? saved : row)),
                );
                setMessage('Automatic relisting preference saved.');
                return undefined;
              } catch (cause) {
                if (cause instanceof ApiError && cause.status === 401) {
                  setSession(null);
                  setLots([]);
                }
                return 'Could not save relisting. Reload lots to check the latest state before trying again.';
              }
            }}
            onSave={async (lot, isTopDeal, topDealOrder) => {
              try {
                const saved = await createCatalogueClient(apiUrl, {
                  accessToken: session.accessToken,
                  deviceId: device,
                }).editTopDeal(lot.id, {
                  isTopDeal,
                  topDealOrder,
                  expectedUpdatedAt: lot.updatedAt,
                });
                setLots((previous) =>
                  previous.map((row) => (row.id === saved.id ? saved : row)),
                );
                setMessage(
                  'Top Deals selection saved. The buyer site updates automatically.',
                );
                return undefined;
              } catch (cause) {
                if (cause instanceof ApiError && cause.status === 401) {
                  setSession(null);
                  setLots([]);
                }
                return cause instanceof ApiError && cause.status === 409
                  ? 'This lot changed or can no longer be featured. Reload lots before saving again.'
                  : 'The selection could not be saved. Reload lots to check the latest state before trying again.';
              }
            }}
          />
          <nav className="agn-admin-pagination" aria-label="Lot pages">
            <Button
              variant="secondary"
              disabled={busy || !history.length}
              onClick={() => {
                setCursor(history.at(-1));
                setHistory((previous) => previous.slice(0, -1));
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !next}
              onClick={() => {
                if (next) {
                  setHistory((previous) => [...previous, cursor]);
                  setCursor(next);
                }
              }}
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </main>
  );
}
