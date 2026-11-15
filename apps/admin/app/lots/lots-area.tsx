'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LotSetupOptions } from '@auction-ng/shared';
import { createCatalogueClient } from '@auction-ng/api-client';
import { createLotsClient } from '@auction-ng/api-client/lots';
import { createLotSetupClient } from '@auction-ng/api-client/lot-setup';
import { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { createPreBidClient } from '@auction-ng/api-client/prebids';
import type { PublishRequest } from './publish-dialog';
import { LotFormPage } from './lot-form';
import { LotsList } from './lots-list';
import { LotViewPage } from './lot-view';

type Route =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'view'; id: string }
  | { kind: 'edit'; id: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function lotsRoute(pathname: string): Route {
  const [, , id, mode] = pathname.split('/');
  if (id === 'new') return { kind: 'new' };
  if (id && uuid.test(id))
    return mode === 'edit' ? { kind: 'edit', id } : { kind: 'view', id };
  return { kind: 'list' };
}

/**
 * Lots inventory (T15e): /lots, /lots/new, /lots/:id and /lots/:id/edit.
 * Moving between them keeps the staff workspace mounted (history API).
 */
export function LotsArea({
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
    () => createLotsClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  const catalogue = useMemo(
    () => createCatalogueClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  const setup = useMemo(
    () => createLotSetupClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  const staffAdmin = useMemo(
    () => createStaffAdminClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  const messageBuyers = useCallback(
    async (lotId: string, message: string, reason: string, key: string) =>
      (
        await staffAdmin.messageLiveBidders({
          idempotencyKey: key,
          operation: 'message',
          lotId,
          message,
          reason,
        })
      ).message,
    [staffAdmin],
  );
  const preBids = useMemo(
    () => createPreBidClient(apiUrl, credentials),
    [apiUrl, credentials],
  );
  // Publishing uses the audited scheduling step (it re-checks the publish
  // rules and launches the lot at its start time).
  const publish = useCallback(
    async (
      lotId: string,
      expectedUpdatedAt: string,
      request: PublishRequest,
    ) => {
      await preBids.schedule(lotId, {
        action: 'schedule',
        startsAt: request.startsAt,
        endsAt: request.endsAt,
        expectedUpdatedAt,
        idempotencyKey: request.idempotencyKey,
        reason: 'Published from the lot form',
      });
    },
    [preBids],
  );
  const canPublish = permissions.includes('auctions.manage');
  const [route, setRoute] = useState<Route>(() =>
    lotsRoute(window.location.pathname),
  );
  const [options, setOptions] = useState<LotSetupOptions>();
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void setup
      .options()
      .then(setOptions)
      .catch(() => undefined);
    void setup
      .staffOptions()
      .then((r) => setStaff(r.items))
      .catch(() => undefined);
  }, [setup]);
  useEffect(() => {
    const sync = () => setRoute(lotsRoute(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const go = useCallback((path: string) => {
    history.pushState(null, '', path);
    setRoute(lotsRoute(new URL(path, window.location.origin).pathname));
    window.scrollTo({ top: 0 });
  }, []);
  if (route.kind === 'view')
    return (
      <LotViewPage
        key={route.id}
        id={route.id}
        client={client}
        go={go}
        messageBuyers={messageBuyers}
      />
    );
  if (route.kind === 'new' || route.kind === 'edit')
    return (
      <LotFormPage
        key={route.kind === 'edit' ? route.id : 'new'}
        id={route.kind === 'edit' ? route.id : null}
        client={client}
        catalogue={catalogue}
        options={options}
        go={go}
        publish={canPublish ? publish : undefined}
      />
    );
  return (
    <LotsList
      client={client}
      options={options}
      staff={staff}
      permissions={permissions}
      online={online}
      go={go}
    />
  );
}
