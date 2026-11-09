import {
  catalogueListInputSchema,
  cataloguePageSchema,
  lotBidHistorySchema,
  topDealAdminPageSchema,
  topDealAdminLotSchema,
  topDealEditSchema,
  autoRelistEditSchema,
  fixedPriceEditSchema,
  topDealAdminInputSchema,
  pastAuctionPageSchema,
  catalogueDetailSchema,
  publicLotResultSchema,
  categoryPageSchema,
  locationPageSchema,
  pageInputSchema,
  createLotInputSchema,
  editLotInputSchema,
  draftLotSchema,
  imageUploadInputSchema,
  imageUploadSchema,
  catalogueImageSchema,
  type CatalogueListInput,
  type PageInput,
  type CreateLotInput,
  type EditLotInput,
  type ImageUploadInput,
  type TopDealEdit,
} from '@auction-ng/shared';
import { ApiError } from './auth';

export function createCatalogueClient(
  baseUrl: string,
  options?: { accessToken: string; deviceId: string },
) {
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    timeout = 60000,
  ) {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        ...(options
          ? {
              Authorization: `Bearer ${options.accessToken}`,
              'X-Device-Id': options.deviceId,
            }
          : {}),
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }
  const params = (input: object) => {
    const result = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined) result.set(key, String(value));
    return result;
  };
  return {
    async result(id: string) {
      return publicLotResultSchema.parse(
        await request(
          `/lots/${encodeURIComponent(id)}/result`,
          'GET',
          undefined,
          5000,
        ),
      );
    },
    async lotHistory(lotId: string, page: PageInput = {}) {
      return lotBidHistorySchema.parse(
        await request(
          `/lots/${encodeURIComponent(lotId)}/bid-history?${params(pageInputSchema.parse(page))}`,
        ),
      );
    },
    async merchandisingLots(
      input: PageInput & { reference?: string; unsoldOnly?: boolean } = {},
    ) {
      return topDealAdminPageSchema.parse(
        await request(
          `/admin/lots?${params(topDealAdminInputSchema.parse(input))}`,
        ),
      );
    },
    async editTopDeal(id: string, input: TopDealEdit) {
      return topDealAdminLotSchema.parse(
        await request(
          `/admin/lots/${encodeURIComponent(id)}/top-deal`,
          'PATCH',
          topDealEditSchema.parse(input),
        ),
      );
    },
    async editFixedPrice(
      id: string,
      input: { fixedPriceKobo: number | null; expectedUpdatedAt: string },
    ) {
      return topDealAdminLotSchema.parse(
        await request(
          `/admin/lots/${encodeURIComponent(id)}/fixed-price`,
          'PATCH',
          fixedPriceEditSchema.parse(input),
        ),
      );
    },
    async editAutoRelist(
      id: string,
      input: { autoRelistEnabled: boolean; expectedUpdatedAt: string },
    ) {
      return topDealAdminLotSchema.parse(
        await request(
          `/admin/lots/${encodeURIComponent(id)}/auto-relist`,
          'PATCH',
          autoRelistEditSchema.parse(input),
        ),
      );
    },
    async pastAuctions(input: PageInput = {}) {
      return pastAuctionPageSchema.parse(
        await request(`/past-auctions?${params(pageInputSchema.parse(input))}`),
      );
    },
    async list(input: CatalogueListInput = {}) {
      return cataloguePageSchema.parse(
        await request(`/lots?${params(catalogueListInputSchema.parse(input))}`),
      );
    },
    async detail(id: string) {
      return catalogueDetailSchema.parse(
        await request(`/lots/${encodeURIComponent(id)}`),
      );
    },
    async categories(input: PageInput = {}) {
      return categoryPageSchema.parse(
        await request(`/categories?${params(pageInputSchema.parse(input))}`),
      );
    },
    async locations(input: PageInput = {}) {
      return locationPageSchema.parse(
        await request(`/locations?${params(pageInputSchema.parse(input))}`),
      );
    },
    async createDraft(input: CreateLotInput) {
      return draftLotSchema.parse(
        await request('/admin/lots', 'POST', createLotInputSchema.parse(input)),
      );
    },
    async getDraft(id: string) {
      return draftLotSchema.parse(
        await request(`/admin/lots/${encodeURIComponent(id)}`),
      );
    },
    async editDraft(id: string, input: EditLotInput) {
      return draftLotSchema.parse(
        await request(
          `/admin/lots/${encodeURIComponent(id)}`,
          'PATCH',
          editLotInputSchema.parse(input),
        ),
      );
    },
    async beginUpload(id: string, input: ImageUploadInput) {
      return imageUploadSchema.parse(
        await request(
          `/admin/lots/${encodeURIComponent(id)}/images/uploads`,
          'POST',
          imageUploadInputSchema.parse(input),
        ),
      );
    },
    async completeUpload(id: string, uploadId: string) {
      return catalogueImageSchema.parse(
        await request(
          `/admin/lots/${encodeURIComponent(id)}/images/uploads/${encodeURIComponent(uploadId)}/complete`,
          'POST',
          {},
        ),
      );
    },
  };
}
