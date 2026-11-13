import {
  lotActivityRowSchema,
  lotBidRowSchema,
  lotBulkResultSchema,
  lotEditorSchema,
  lotInvoiceSchema,
  lotLabelSchema,
  lotListPageSchema,
  lotListSetupSchema,
  lotPreferencesSchema,
  lotSavedViewSchema,
  lotTabPageSchema,
  lotViewSchema,
  lotWatcherRowSchema,
  lotCsvCheckSchema,
  lotCsvImportSchema,
  lotDuplicateResultSchema,
  lotFileSchema,
  lotMessageResultSchema,
  type LotBulk,
  type LotSave,
} from '@auction-ng/shared/lots-admin';
import { apiErrorFromResponse } from './auth';

// Lots inventory (T15e).
export function createLotsClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' = 'GET',
    body?: unknown,
    timeout = 20000,
  ) {
    const response = await fetch(new URL('/admin/inventory/' + path, baseUrl), {
      method,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response.json() as Promise<unknown>;
  }
  const query = (input: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(input))
      if (v !== undefined && v !== '') q.set(k, String(v));
    return q.toString();
  };
  const id = (value: string) => encodeURIComponent(value);
  return {
    list: async (input: Record<string, string | number | undefined>) =>
      lotListPageSchema.parse(await request(`lots?${query(input)}`)),
    setup: async () => lotListSetupSchema.parse(await request('setup')),
    saveView: async (name: string, q: Record<string, string>) =>
      lotSavedViewSchema.parse(
        await request('views', 'POST', { name, query: q }),
      ),
    deleteView: async (viewId: string) =>
      request(`views/${id(viewId)}/delete`, 'POST', {}),
    savePreferences: async (input: {
      hiddenColumns: string[];
      layout: 'table' | 'grid';
    }) =>
      lotPreferencesSchema.parse(await request('preferences', 'PATCH', input)),
    view: async (lotId: string) =>
      lotViewSchema.parse(await request(`lots/${id(lotId)}`)),
    editor: async (lotId: string) =>
      lotEditorSchema.parse(await request(`lots/${id(lotId)}/editor`)),
    create: async (input: LotSave) =>
      lotEditorSchema.parse(await request('lots', 'POST', input)),
    edit: async (lotId: string, input: LotSave) =>
      lotEditorSchema.parse(await request(`lots/${id(lotId)}`, 'PATCH', input)),
    bids: async (lotId: string, cursor?: string) =>
      lotTabPageSchema(lotBidRowSchema).parse(
        await request(`lots/${id(lotId)}/bids?${query({ cursor })}`),
      ),
    watchers: async (lotId: string, cursor?: string) =>
      lotTabPageSchema(lotWatcherRowSchema).parse(
        await request(`lots/${id(lotId)}/watchers?${query({ cursor })}`),
      ),
    activity: async (lotId: string, cursor?: string) =>
      lotTabPageSchema(lotActivityRowSchema).parse(
        await request(`lots/${id(lotId)}/activity?${query({ cursor })}`),
      ),
    invoice: async (lotId: string) =>
      lotInvoiceSchema.parse(await request(`lots/${id(lotId)}/invoice`)),
    photos: async (
      lotId: string,
      input: {
        order: string[];
        defects: string[];
        remove: string[];
        expectedUpdatedAt: string;
      },
    ) =>
      lotEditorSchema.parse(
        await request(`lots/${id(lotId)}/photos`, 'POST', input),
      ),
    duplicate: async (lotId: string, idempotencyKey: string) =>
      lotDuplicateResultSchema.parse(
        await request(`lots/${id(lotId)}/duplicate`, 'POST', {
          idempotencyKey,
        }),
      ),
    archive: async (
      lotId: string,
      expectedUpdatedAt: string,
      archived = true,
    ) =>
      lotMessageResultSchema.parse(
        await request(
          `lots/${id(lotId)}/${archived ? 'archive' : 'unarchive'}`,
          'POST',
          {
            expectedUpdatedAt,
          },
        ),
      ),
    remove: async (
      lotId: string,
      input: { reason: string; freeBin: boolean; expectedUpdatedAt: string },
    ) =>
      lotMessageResultSchema.parse(
        await request(`lots/${id(lotId)}/delete`, 'POST', input),
      ),
    restore: async (lotId: string, expectedUpdatedAt: string) =>
      lotMessageResultSchema.parse(
        await request(`lots/${id(lotId)}/restore`, 'POST', {
          expectedUpdatedAt,
        }),
      ),
    bulk: async (input: LotBulk) =>
      lotBulkResultSchema.parse(await request('bulk', 'POST', input, 120000)),
    csvTemplate: async (categoryId: string) =>
      lotFileSchema.parse(
        await request(`csv-template?${query({ categoryId })}`),
      ),
    csvCheck: async (categoryId: string, csv: string) =>
      lotCsvCheckSchema.parse(
        await request('csv-check', 'POST', { categoryId, csv }, 60000),
      ),
    csvImport: async (
      categoryId: string,
      csv: string,
      idempotencyKey: string,
    ) =>
      lotCsvImportSchema.parse(
        await request(
          'csv-import',
          'POST',
          { categoryId, csv, idempotencyKey },
          180000,
        ),
      ),
    exportCsv: async (input: Record<string, string | number | undefined>) =>
      lotFileSchema.parse(
        await request(`export?${query(input)}`, 'GET', undefined, 120000),
      ),
    labels: async (ids: string[]) =>
      lotLabelSchema.parse(await request('labels', 'POST', { ids })),
  };
}
export type LotsClient = ReturnType<typeof createLotsClient>;
