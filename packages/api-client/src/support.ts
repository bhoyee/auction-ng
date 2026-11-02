import { io } from 'socket.io-client';
import {
  supportActionSchema,
  supportAvailabilitySchema,
  supportConversationSchema,
  supportCreateSchema,
  supportStaffCreateSchema,
  supportMessageInputSchema,
  supportMessagePageSchema,
  supportMessagesInputSchema,
  supportListInputSchema,
  supportPageSchema,
  supportSignalSchema,
  bidCancellationRequestSchema,
  bidCancellationStateSchema,
  type SupportCreate,
  type SupportMessageInput,
  type SupportAction,
  type SupportListInput,
  type BidCancellationRequestInput,
} from '@auction-ng/shared/support-schemas';
import { apiErrorFromResponse } from './auth';
import { supportDeliveryReportSchema } from '@auction-ng/shared/support-schemas';
import {
  bidCancellationApprovalSchema,
  bidCancellationApprovalResultSchema,
  bidCancellationQuoteSchema,
  type BidCancellationApprovalInput,
} from '@auction-ng/shared';
export async function deliverSupportNotifications(
  baseUrl: string,
  token: string,
) {
  const origin = new URL(baseUrl);
  if (
    token.length < 32 ||
    origin.protocol !== 'http:' ||
    !['api', 'localhost', '127.0.0.1'].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error('Use the private API origin and support-delivery token.');
  const response = await fetch(new URL('/internal/support/deliver', baseUrl), {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(125000),
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return supportDeliveryReportSchema.parse(await response.json());
}
export function createSupportClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
  staff = false,
  renew?: (
    failedToken: string,
  ) => Promise<{ accessToken: string; deviceId: string } | null>,
) {
  async function request(path: string, body?: unknown) {
    const url = new URL(
      path.startsWith('/admin/') ? path : '/support/' + path,
      baseUrl,
    );
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401 && renew) {
      const fresh = await renew(credentials.accessToken);
      if (fresh) {
        credentials = fresh;
        const retry = await fetch(url, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            Authorization: `Bearer ${fresh.accessToken}`,
            'X-Device-Id': fresh.deviceId,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          redirect: 'error',
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(20000),
        });
        if (!retry.ok) throw await apiErrorFromResponse(retry);
        return retry;
      }
    }
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response;
  }
  return {
    async cancellationQuote(id: string) {
      const response = await request(
        '/admin/bid-cancellations/' + encodeURIComponent(id),
      );
      return bidCancellationQuoteSchema.parse(await response.json());
    },
    async approveCancellation(id: string, input: BidCancellationApprovalInput) {
      const response = await request(
        '/admin/bid-cancellations/' + encodeURIComponent(id) + '/approve',
        bidCancellationApprovalSchema.parse(input),
      );
      return bidCancellationApprovalResultSchema.parse(await response.json());
    },
    async bidCancellation(lotId: string) {
      return bidCancellationStateSchema.parse(
        await (
          await request(`lots/${encodeURIComponent(lotId)}/bid-cancellation`)
        ).json(),
      );
    },
    async requestBidCancellation(
      lotId: string,
      input: BidCancellationRequestInput,
    ) {
      return bidCancellationStateSchema.parse(
        await (
          await request(
            `lots/${encodeURIComponent(lotId)}/bid-cancellation`,
            bidCancellationRequestSchema.parse(input),
          )
        ).json(),
      );
    },
    async list(input: SupportListInput) {
      const parsed = supportListInputSchema.parse(input);
      const q = new URLSearchParams(
        Object.entries(parsed)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      );
      return supportPageSchema.parse(
        await (await request('conversations?' + q)).json(),
      );
    },
    async get(id: string) {
      return supportConversationSchema.parse(
        await (await request('conversations/' + id)).json(),
      );
    },
    async create(input: SupportCreate & { buyerEmail?: string }) {
      return supportConversationSchema.parse(
        await (
          await request(
            staff ? 'staff/conversations' : 'conversations',
            (staff ? supportStaffCreateSchema : supportCreateSchema).parse(
              input,
            ),
          )
        ).json(),
      );
    },
    async messages(id: string, cursor?: string) {
      const query = supportMessagesInputSchema.parse({
        limit: 50,
        ...(cursor ? { cursor } : {}),
      });
      return supportMessagePageSchema.parse(
        await (
          await request(
            'conversations/' +
              id +
              '/messages?' +
              new URLSearchParams(
                Object.entries(query).map(([k, v]) => [k, String(v)]),
              ),
          )
        ).json(),
      );
    },
    async send(id: string, input: SupportMessageInput) {
      return supportConversationSchema.parse(
        await (
          await request(
            'conversations/' + id + '/messages',
            supportMessageInputSchema.parse(input),
          )
        ).json(),
      );
    },
    async action(id: string, input: SupportAction) {
      return supportConversationSchema.parse(
        await (
          await request(
            'conversations/' + id + '/actions',
            supportActionSchema.parse(input),
          )
        ).json(),
      );
    },
    async availability() {
      return supportAvailabilitySchema.parse(
        await (await request('availability')).json(),
      );
    },
    async presence(accepting: boolean) {
      return supportAvailabilitySchema.parse(
        await (await request('presence', { accepting })).json(),
      );
    },
    async attachment(id: string) {
      return (await request('attachments/' + id)).blob();
    },
  };
}
export function connectSupport(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
  onChange: (id: string) => void,
  onStatus: (connected: boolean) => void,
) {
  const socket = io(baseUrl, {
    auth: credentials,
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  socket.on('connect', () => {
    onStatus(true);
    onChange('');
  });
  socket.on('disconnect', () => onStatus(false));
  socket.on('connect_error', () => onStatus(false));
  socket.on('support:changed', (value) => {
    const parsed = supportSignalSchema.safeParse(value);
    if (parsed.success) onChange(parsed.data.conversationId);
  });
  return () => {
    socket.removeAllListeners();
    socket.disconnect();
  };
}
