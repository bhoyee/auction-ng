type Shape<T> = { parse: (input: unknown) => T };
export { watchBidReviewUpdates } from './staff-bid-review-live';
export { connectStaffLive } from './staff-live';
import * as s from '@auction-ng/shared';
import { apiErrorFromResponse } from './auth';
export { subscribeStaffActivity as connectStaffActivity } from './staff-realtime';
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
    liveLotDetails: (id: string, cursor?: string) =>
      get(
        'live-monitor/lots/' +
          encodeURIComponent(id) +
          '/details' +
          (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
        s.monitorLotDetailSchema,
      ),
    liveLotControlQuote: (id: string) =>
      get(
        'live-monitor/lots/' + encodeURIComponent(id) + '/control',
        s.lotControlQuoteSchema,
      ),
    controlLiveLot: (input: s.LotControlInput) =>
      post('live-monitor/lot-control', s.lotControlInputSchema, input),
    liveBidHistory: (
      id: string,
      input: { limit?: number; cursor?: string } = {},
    ) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(
        s.monitorHistoryQuerySchema.parse(input),
      ))
        if (value !== undefined) query.set(key, String(value));
      return get(
        'live-monitor/lots/' + encodeURIComponent(id) + '/bids?' + query,
        s.monitorHistorySchema,
      );
    },
    recordLiveHistory: (input: s.MonitorCommand) =>
      post('live-monitor/history', s.monitorCommandSchema, input),
    messageLiveBidders: (input: s.MonitorCommand) =>
      post('live-monitor/message', s.monitorCommandSchema, input),
    controlLiveBidding: (input: s.MonitorCommand) =>
      post('live-monitor/control', s.monitorCommandSchema, input),
    liveSummary: () => get('live-monitor/summary', s.monitorSummarySchema),
    liveSeries: () => get('live-monitor/series', s.monitorSeriesSchema),
    liveIssues: () => get('live-monitor/issues', s.monitorIssuesSchema),
    liveFilters: () => get('live-monitor/filters', s.monitorFiltersSchema),
    liveLots: (input: s.MonitorQuery = {}) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(
        s.liveMonitorQuerySchema.parse(input),
      ))
        if (value !== undefined) query.set(key, String(value));
      return get('live-monitor/lots?' + query, s.monitorLotsSchema);
    },
    liveClosed: (input: s.MonitorQuery = {}) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(
        s.liveMonitorQuerySchema.parse(input),
      ))
        if (value !== undefined) query.set(key, String(value));
      return get('live-monitor/closed?' + query, s.monitorClosedSchema);
    },
    overviewWidget: (widget: s.OverviewWidget, input: s.OverviewQuery) => {
      const query = new URLSearchParams(s.overviewQuerySchema.parse(input));
      return get(
        'analytics/overview/' +
          s.overviewWidgetSchema.parse(widget) +
          '?' +
          query,
        s.overviewResponseSchema,
      );
    },
    bidReview: (input: s.StaffBidReviewQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(
        s.staffBidReviewQuerySchema.parse(input),
      ))
        if (value !== undefined) params.set(key, String(value));
      return get('bid-review?' + params, s.staffBidReviewPageSchema);
    },
    bidReviewDetail: (id: string, input: s.StaffBidReviewHistoryQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(
        s.staffBidReviewHistoryQuerySchema.parse(input),
      ))
        if (value !== undefined) params.set(key, String(value));
      return get(
        'bid-review/' + s.staffIdSchema.parse(id) + '?' + params,
        s.staffBidReviewDetailSchema,
      );
    },
    recordBidReview: async (id: string, idempotencyKey: string) => {
      const response = await fetch(
        new URL(
          '/staff/bid-review/' + s.staffIdSchema.parse(id) + '/open',
          baseUrl,
        ),
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + credentials.accessToken,
            'X-Device-Id': credentials.deviceId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idempotencyKey: s.staffIdSchema.parse(idempotencyKey),
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw await apiErrorFromResponse(response);
      return s.staffMutationResultSchema.parse(await response.json());
    },
    setup: (input: s.StaffSetupQuery) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(s.staffSetupQuerySchema.parse(input)))
        if (v !== undefined) q.set(k, String(v));
      return get('setup?' + q, s.staffSetupPageSchema);
    },
    saveSetup: (v: s.StaffSetupSave) =>
      post('setup', s.staffSetupSaveSchema, v),
    archiveSetup: (v: s.StaffSetupArchive) =>
      post('setup/archive', s.staffSetupArchiveSchema, v),
    preferences: () => get('preferences', s.staffPreferencesSchema),
    savePreferences: (v: s.StaffPreferences) =>
      post('preferences', s.staffPreferencesSaveSchema, {
        idempotencyKey: crypto.randomUUID(),
        reason: 'Personal workspace preferences',
        preferences: v,
      }),
    visit: (page: s.StaffPage) =>
      post('activity', s.staffPageVisitSchema, {
        idempotencyKey: crypto.randomUUID(),
        page,
      }),
    auditDetail: (id: string) =>
      get('audit/' + s.staffIdSchema.parse(id), s.staffAuditDetailSchema),
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
