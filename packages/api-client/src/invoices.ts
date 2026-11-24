import * as s from '@auction-ng/shared/invoices';
import { apiErrorFromResponse } from './auth';

type Query = Record<string, string | number | undefined>;
type Keyed<T> = T & { idempotencyKey: string };

// Invoices (T15f).
export function createInvoicesClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function send(path: string, query: Query = {}, body?: unknown) {
    const url = new URL(path, baseUrl);
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response;
  }
  const json = async (
    path: string,
    query?: Query,
    body?: unknown,
  ): Promise<unknown> =>
    (await send('/admin/invoices' + path, query, body)).json();
  const id = (value: string) => '/' + encodeURIComponent(value);
  const change = async (path: string, body: object) =>
    s.invoiceResultSchema.parse(await json(path, {}, body));
  return {
    list: async (query: Query) =>
      s.invoiceListPageSchema.parse(await json('', query)),
    export: async (query: Query) =>
      s.invoiceExportSchema.parse(await json('/export', query)),
    view: async (number: string) =>
      s.invoiceViewSchema.parse(await json(id(number))),
    pickup: async (number: string) =>
      s.invoicePickupViewSchema.parse(await json(id(number) + '/pickup')),
    pdf: async (number: string) =>
      (await send('/admin/invoices' + id(number) + '/pdf')).blob(),
    receipt: async (number: string, from: string, to: string) =>
      (
        await send('/admin/invoices' + id(number) + '/receipt', { from, to })
      ).blob(),
    refundQueue: async (query: Query) =>
      s.refundQueueSchema.parse(await json('/refunds', query)),
    requestRefund: (body: s.RefundRequestInput) => change('/refunds', body),
    decideRefund: (
      body: Keyed<{ requestId: string; approve: boolean; note: string }>,
    ) => change('/refunds/decide', body),
    addNote: (body: Keyed<{ invoiceId: string; body: string }>) =>
      change('/notes', body),
    resend: (body: Keyed<{ invoiceId: string }>) => change('/resend', body),
    dispute: (body: Keyed<{ invoiceId: string; message: string }>) =>
      change('/disputes', body),
    company: async () => s.companyViewSchema.parse(await json('/company')),
    saveCompany: (
      body: Keyed<{ details: s.CompanyDetails; expectedRevision: number }>,
    ) => change('/company', body),
  };
}
export type InvoicesClient = ReturnType<typeof createInvoicesClient>;

/** A buyer's own invoice files. */
export function createBuyerInvoicesClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function send(path: string) {
    const response = await fetch(new URL('/buyers/' + path, baseUrl), {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
      },
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response;
  }
  return {
    pdf: async (id: string) =>
      (await send(`invoices/${encodeURIComponent(id)}/pdf`)).blob(),
    receipt: async (from: string, to: string) =>
      (await send(`receipt?from=${from}&to=${to}`)).blob(),
    refunds: async (id: string) =>
      s.buyerInvoiceRefundsSchema.parse(
        await (await send(`invoices/${encodeURIComponent(id)}/refunds`)).json(),
      ),
  };
}
