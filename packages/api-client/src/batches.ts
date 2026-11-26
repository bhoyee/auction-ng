import * as s from '@auction-ng/shared/batches';
import { apiErrorFromResponse } from './auth';

type Query = Record<string, string | number | undefined>;
type Command = {
  id: string;
  expectedUpdatedAt: string;
  idempotencyKey: string;
};

// Inventory batches (T15e).
export function createBatchesClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function send(
    path: string,
    {
      query,
      body,
      timeout = 20_000,
    }: {
      query?: Query;
      body?: unknown;
      timeout?: number;
    } = {},
  ) {
    const url = new URL('/admin/batches' + path, baseUrl);
    for (const [k, v] of Object.entries(query ?? {}))
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response;
  }
  const json = async (
    path: string,
    options?: Parameters<typeof send>[1],
  ): Promise<unknown> => (await send(path, options)).json();
  const id = (value: string) => '/' + encodeURIComponent(value);
  return {
    list: async (query: Query) =>
      s.batchPageSchema.parse(await json('', { query })),
    export: async (query: Query) =>
      s.batchExportSchema.parse(
        await json('/export', { query, timeout: 60_000 }),
      ),
    picker: async (query: Query) =>
      s.batchPickerSchema.parse(await json('/picker', { query })),
    form: async () => s.batchFormSchema.parse(await json('/form')),
    detail: async (batchId: string) =>
      s.batchDetailSchema.parse(await json(id(batchId))),
    stuck: async (batchId: string, cursor?: string) =>
      s.batchStuckPageSchema.parse(
        await json(id(batchId) + '/stuck', { query: { cursor } }),
      ),
    activity: async (batchId: string, cursor?: string) =>
      s.batchActivitySchema.parse(
        await json(id(batchId) + '/activity', { query: { cursor } }),
      ),
    save: async (body: s.BatchSave) =>
      s.batchResultSchema.parse(await json('', { body })),
    receive: async (body: Command & { itemsReceived: number }) =>
      s.batchResultSchema.parse(await json('/receive', { body })),
    close: async (body: Command & { reason: string }) =>
      s.batchResultSchema.parse(await json('/close', { body })),
    deleteUnused: async (
      body: Command & { reason: string; confirmation: string },
    ) =>
      s.batchResultSchema.parse(
        await json('/delete', { body: s.batchDeleteSchema.parse(body) }),
      ),
    restore: async (body: Command & { reason: string }) =>
      s.batchResultSchema.parse(
        await json('/restore', { body: s.batchReasonSchema.parse(body) }),
      ),
    reopen: async (body: Command & { reason: string }) =>
      s.batchResultSchema.parse(await json('/reopen', { body })),
    writeOff: async (
      batchId: string,
      body: { lotIds: string[]; reason: string; idempotencyKey: string },
    ) =>
      s.batchWriteOffResultSchema.parse(
        await json(id(batchId) + '/write-off', { body, timeout: 60_000 }),
      ),
    files: async (batchId: string) =>
      s.batchFilesSchema.parse(await json(id(batchId) + '/files')),
    addFile: async (
      batchId: string,
      body: { name: string; content: string; idempotencyKey: string },
    ) =>
      s.batchResultSchema.parse(
        await json(id(batchId) + '/files', { body, timeout: 120_000 }),
      ),
    file: async (batchId: string, fileId: string) =>
      (
        await send(id(batchId) + '/files' + id(fileId), { timeout: 60_000 })
      ).blob(),
    removeFile: async (batchId: string, fileId: string) =>
      s.batchResultSchema.parse(
        await json(id(batchId) + '/files' + id(fileId) + '/remove', {
          body: {},
        }),
      ),
  };
}
export type BatchesClient = ReturnType<typeof createBatchesClient>;
