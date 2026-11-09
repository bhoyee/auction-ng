'use client';
import { useCallback, useEffect, useMemo } from 'react';
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
  const query = useSearchParams();
  const { tokens } = useBuyer();
  const id = query.get('conversation');
  const open = useCallback(
    (conversation?: string) => {
      if (tokens)
        window.dispatchEvent(
          new CustomEvent('auction-ng-open-support', {
            detail: {
              userId: tokens.user.id,
              conversation: conversation ?? '',
            },
          }),
        );
    },
    [tokens?.user.id],
  );
  useEffect(() => {
    // Wait for the shell's chat listener when arriving through an email link.
    if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return;
    const timer = window.setTimeout(() => open(id), 0);
    return () => window.clearTimeout(timer);
  }, [id, open]);
  return (
    <BuyerPage
      title="Customer service"
      description="Your conversations, with help from our team when you need it."
    >
      <BuyerSupport presentation="history" onOpenConversation={open} />
    </BuyerPage>
  );
}
export function BuyerSupport({
  presentation = 'popup',
  initialId = '',
  onOpenConversation,
  startNew = false,
}: {
  presentation?: 'popup' | 'history';
  initialId?: string;
  onOpenConversation?: (id?: string) => void;
  startNew?: boolean;
}) {
  const { tokens, deviceId, renewSession } = useBuyer();
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
    <>
      {tokens && client ? (
        <SupportWorkspace
          key={tokens.user.id + ':' + initialId}
          client={client}
          connect={connect}
          initialId={initialId}
          presentation={presentation}
          onOpenConversation={onOpenConversation}
          startNew={startNew}
        />
      ) : (
        <BuyerSkeleton />
      )}
    </>
  );
}
