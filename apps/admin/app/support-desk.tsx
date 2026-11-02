'use client';
import { useCallback, useMemo } from 'react';
import {
  createSupportClient,
  connectSupport,
} from '@auction-ng/api-client/support';
import { createStaffAuthClient } from '@auction-ng/api-client/staff-auth';
import { SupportWorkspace } from '@auction-ng/ui/web/support-workspace';
import type { TokenResponse } from '@auction-ng/shared';
import { BidCancellationApproval } from './bid-cancellation-approval';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const realtime =
  process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4001';
export function SupportDesk({
  session,
  deviceId,
  onSession,
}: {
  session: TokenResponse;
  deviceId: string;
  onSession: (value: TokenResponse) => void;
}) {
  const client = useMemo(
    () =>
      createSupportClient(
        api,
        { accessToken: session.accessToken, deviceId },
        true,
        async () => {
          const fresh = await createStaffAuthClient(api, deviceId).refresh();
          if (fresh.user.id !== session.user.id) return null;
          onSession(fresh);
          return { accessToken: fresh.accessToken, deviceId };
        },
      ),
    [session.accessToken, deviceId, onSession],
  );
  const connect = useCallback(
    (change: (id: string) => void, status: (value: boolean) => void) =>
      connectSupport(
        realtime,
        { accessToken: session.accessToken, deviceId },
        change,
        status,
      ),
    [session.accessToken, deviceId],
  );
  return (
    <SupportWorkspace
      client={client}
      staff
      connect={connect}
      conversationAction={
        session.user.role === 'admin'
          ? (conversation) =>
              conversation.topic === 'bidding' &&
              conversation.subject.startsWith('Bid cancellation request') ? (
                <BidCancellationApproval
                  key={conversation.id}
                  conversation={conversation}
                  client={client}
                />
              ) : null
          : undefined
      }
    />
  );
}
