type Shape<T> = { parse: (input: unknown) => T };
import * as s from '@auction-ng/shared';
import { apiErrorFromResponse } from './auth';
import { io } from 'socket.io-client';
export function createStaffAdminClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function get<T>(path: string, shape: Shape<T>) {
    const r = await fetch(new URL('/staff/' + path, baseUrl), {
      headers: {
        Authorization: 'Bearer ' + credentials.accessToken,
        'X-Device-Id': credentials.deviceId,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw await apiErrorFromResponse(r);
    return shape.parse(await r.json());
  }
  async function post(path: string, shape: Shape<unknown>, input: unknown) {
    const r = await fetch(new URL('/staff/' + path, baseUrl), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + credentials.accessToken,
        'X-Device-Id': credentials.deviceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(shape.parse(input)),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw await apiErrorFromResponse(r);
    return s.staffMutationResultSchema.parse(await r.json());
  }
  return {
    notifications: (cursor?: string) =>
      get(
        'notifications?limit=20' +
          (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
        s.staffInboxPageSchema,
      ),
    async readNotifications(ids: string[]) {
      const r = await fetch(new URL('/staff/notifications/read', baseUrl), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + credentials.accessToken,
          'X-Device-Id': credentials.deviceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(s.staffInboxReadSchema.parse({ ids })),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw await apiErrorFromResponse(r);
      return s.staffInboxReadResultSchema.parse(await r.json());
    },
    photos: (id: string) =>
      get('lot-images/' + s.staffIdSchema.parse(id), s.staffImagesSchema),
    me: () => get('me', s.staffAccessSchema),
    overview: () => get('overview', s.staffDashboardSchema),
    records: (input: s.StaffRecordQuery) => {
      const value = s.staffRecordQuerySchema.parse(input),
        q = new URLSearchParams();
      for (const [k, v] of Object.entries(value))
        if (v !== undefined) q.set(k, String(v));
      return get('records?' + q, s.staffRecordPageSchema);
    },
    saveRole: (v: s.StaffRoleSave) => post('roles', s.staffRoleSaveSchema, v),
    invite: (v: s.StaffInvite) => post('invite', s.staffInviteSchema, v),
    assign: (v: s.StaffAssignment) =>
      post('assignment', s.staffAssignmentSchema, v),
    archive: (v: s.StaffArchive) => post('archive', s.staffArchiveSchema, v),
    buyerAction: (v: s.StaffBuyerAction) =>
      post('buyer-action', s.staffBuyerActionSchema, v),
    refund: (v: s.StaffRefund) => post('refund', s.staffRefundSchema, v),
    importDrafts: (v: s.StaffCsv) => post('import', s.staffCsvSchema, v),
  };
}
export function connectStaffActivity(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
  onChange: () => void,
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
    onChange();
  });
  socket.on('disconnect', () => onStatus(false));
  socket.on('connect_error', () => onStatus(false));
  socket.on('staff:changed', () => onChange());
  return () => {
    socket.removeAllListeners();
    socket.disconnect();
  };
}
export function createStaffEnrollmentClient(baseUrl: string) {
  async function request<T>(path: string, body: unknown, shape: Shape<T>) {
    const r = await fetch(new URL('/staff/enrollment/' + path, baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw await apiErrorFromResponse(r);
    return shape.parse(await r.json());
  }
  return {
    start: (token: string) =>
      request(
        'start',
        s.staffEnrollmentStartSchema.parse({ token }),
        s.staffEnrollmentSchema,
      ),
    finish: (input: s.StaffEnrollmentFinish) =>
      request(
        'finish',
        s.staffEnrollmentFinishSchema.parse(input),
        s.staffMutationResultSchema,
      ),
  };
}
