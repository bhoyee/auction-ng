'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createInvoicesClient } from '@auction-ng/api-client/invoices';
import { createLotSetupClient } from '@auction-ng/api-client/lot-setup';
import { InvoicePage, InvoicePickupPage } from './invoice-page';
import { InvoicesList } from './invoices-list';

const BASE = '/orders/invoices';
const valid = /^[A-Z0-9-]{3,40}$/;
function readRoute() {
  const page = window.location.pathname.split('/')[3] ?? '';
  const drawer =
    new URLSearchParams(window.location.search).get('invoice') ?? '';
  return {
    page: valid.test(page) ? page : undefined,
    drawer: valid.test(drawer) ? drawer : undefined,
  };
}

/**
 * Invoices (T15f): /orders/invoices, ?invoice=NUMBER for the drawer, and
 * /orders/invoices/NUMBER, keeping the staff workspace mounted.
 */
export function InvoicesArea({
  apiUrl,
  accessToken,
  deviceId,
  online,
  permissions,
}: {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  online: boolean;
  permissions: readonly string[];
}) {
  const credentials = useMemo(
    () => ({ accessToken, deviceId }),
    [accessToken, deviceId],
  );
  const client = useMemo(
    () => createInvoicesClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  const setup = useMemo(
    () => createLotSetupClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(
    [],
  );
  const canRead = permissions.includes('invoices.read');
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    if (canRead)
      void setup
        .options()
        .then((o) => setLocations(o.locations))
        .catch(() => undefined);
  }, [setup, canRead]);
  useEffect(() => {
    const sync = () => {
      if (window.location.pathname.startsWith(BASE)) setRoute(readRoute());
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const go = useCallback((path: string) => {
    history.pushState(null, '', path);
    setRoute(readRoute());
  }, []);
  const select = useCallback((number?: string) => {
    // Moving between rows replaces, so Back leaves the list in one step.
    history.replaceState(null, '', BASE + (number ? `?invoice=${number}` : ''));
    setRoute(readRoute());
  }, []);
  if (!canRead)
    return route.page ? (
      <InvoicePickupPage number={route.page} client={client} />
    ) : (
      <p className="lv-setup-readonly" role="note">
        Open an invoice from its number at the pickup desk.
      </p>
    );
  if (route.page)
    return (
      <InvoicePage
        key={route.page}
        number={route.page}
        client={client}
        onBack={() => go(BASE)}
      />
    );
  return (
    <InvoicesList
      client={client}
      locations={locations}
      online={online}
      selected={route.drawer}
      onSelect={select}
      onOpen={(number) => {
        go(`${BASE}/${number}`);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}
