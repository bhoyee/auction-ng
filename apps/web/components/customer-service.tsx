'use client';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  createSupportClient,
  connectSupport,
} from '@auction-ng/api-client/support';
import { SupportWorkspace } from '@auction-ng/ui/web/support-workspace';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerSkeleton } from '@auction-ng/ui/web/buyer';
import { apiUrl, realtimeUrl, useBuyer } from '../lib/session';
export function CustomerService() {
  const { tokens, deviceId, renewSession } = useBuyer();
  const query = useSearchParams();
  const id = query.get('conversation');
  const initialId = id && /^[a-f0-9-]{36}$/i.test(id) ? id : '';
  const client = useMemo(
    () =>
      tokens
        ? createSupportClient(
            apiUrl,
            { accessToken: tokens.accessToken, deviceId },
            false,
            async (failed) => {
              const fresh = await renewSession(failed);
              return fresh?.user.id === tokens.user.id
                ? { accessToken: fresh.accessToken, deviceId }
                : null;
            },
          )
        : null,
    [tokens?.accessToken, deviceId, renewSession],
  );
  const connect = useCallback(
    (change: (id: string) => void, status: (value: boolean) => void) =>
      tokens
        ? connectSupport(
            realtimeUrl,
            { accessToken: tokens.accessToken, deviceId },
            change,
            status,
          )
        : () => {},
    [tokens?.accessToken, deviceId],
  );
  return (
    <BuyerPage
      title="Customer service"
      description="Answers when you need them. A real team when you need a person."
    >
      {tokens && client ? (
        <SupportWorkspace
          key={tokens.user.id + ':' + initialId}
          client={client}
          connect={connect}
          initialId={initialId}
        />
      ) : (
        <BuyerSkeleton />
      )}
    </BuyerPage>
  );
}
