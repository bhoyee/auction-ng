'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LotSetupOptions } from '@auction-ng/shared';
import { createBatchesClient } from '@auction-ng/api-client/batches';
import { createLotSetupClient } from '@auction-ng/api-client/lot-setup';
import { createLotsClient } from '@auction-ng/api-client/lots';
import { BatchesList } from './batches-list';
import { BatchForm } from './batch-form';

type Route =
  | { kind: 'list'; id?: string }
  | { kind: 'new' }
  | { kind: 'edit'; id: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function batchesRoute(pathname: string): Route {
  const [, , id, mode] = pathname.split('/');
  if (id === 'new') return { kind: 'new' };
  if (id && uuid.test(id))
    return mode === 'edit' ? { kind: 'edit', id } : { kind: 'list', id };
  return { kind: 'list' };
}

/** Opens another staff page (Lots, Lot setup) without reloading. */
export function openStaffPage(section: string, path: string) {
  history.pushState(null, '', path);
  window.dispatchEvent(
    new CustomEvent('giddydeal:open-section', { detail: section }),
  );
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Inventory batches (T15e): /batches, /batches/new, /batches/:id and
 * /batches/:id/edit, keeping the staff workspace mounted (history API).
 */
export function BatchesArea({
  apiUrl,
  accessToken,
  deviceId,
  online,
  permissions,
  onSuppliers,
}: {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  online: boolean;
  permissions: readonly string[];
  onSuppliers: () => void;
}) {
  const credentials = useMemo(
    () => ({ accessToken, deviceId }),
    [accessToken, deviceId],
  );
  const client = useMemo(
    () => createBatchesClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  const lots = useMemo(
    () => createLotsClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  const setup = useMemo(
    () => createLotSetupClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  const [options, setOptions] = useState<LotSetupOptions>();
  useEffect(() => {
    void setup
      .options()
      .then(setOptions)
      .catch(() => undefined);
  }, [setup]);
  const [route, setRoute] = useState<Route>(() =>
    batchesRoute(window.location.pathname),
  );
  useEffect(() => {
    const sync = () => {
      if (window.location.pathname.startsWith('/batches'))
        setRoute(batchesRoute(window.location.pathname));
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const go = useCallback((path: string, top = true) => {
    history.pushState(null, '', path);
    setRoute(batchesRoute(new URL(path, window.location.origin).pathname));
    if (top) window.scrollTo({ top: 0 });
  }, []);
  if (route.kind !== 'list')
    return (
      <BatchForm
        key={route.kind === 'edit' ? route.id : 'new'}
        id={route.kind === 'edit' ? route.id : null}
        client={client}
        setup={setup}
        online={online}
        canSeeBank={permissions.includes('suppliers.bank')}
        go={go}
      />
    );
  return (
    <BatchesList
      client={client}
      lots={permissions.includes('inventory.read') ? lots : undefined}
      options={options}
      selectedId={route.id}
      online={online}
      canSeeSuppliers={
        permissions.includes('suppliers.read') ||
        permissions.includes('setup.manage')
      }
      onSuppliers={onSuppliers}
      go={go}
    />
  );
}
