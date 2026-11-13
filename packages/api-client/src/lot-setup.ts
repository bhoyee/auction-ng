import * as s from '@auction-ng/shared';

import { apiErrorFromResponse } from './auth';

type Shape<T> = { parse: (input: unknown) => T };
type In<T extends s.LotSetupSchema> = s.LotSetupInput<T>;
// Every change carries its own retry key; the client adds one when omitted.
type Change<T extends s.LotSetupSchema> = Omit<In<T>, 'idempotencyKey'> & {
  idempotencyKey?: string;
};

// Typed client for Lot setup (categories, locations, bins, conditions,
// suppliers, brands). Validation happens on the server so errors come back
// as plain-language field messages (ApiError.field and ApiError.detail).
export function createLotSetupClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  const headers = () => ({
    Authorization: 'Bearer ' + credentials.accessToken,
    'X-Device-Id': credentials.deviceId,
  });
  async function get<T>(
    path: string,
    shape: Shape<T>,
    query: Record<string, string | number | undefined> = {},
  ) {
    const url = new URL('/admin/lot-setup/' + path, baseUrl);
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== '')
        url.searchParams.set(key, String(value));
    const r = await fetch(url, {
      headers: headers(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw await apiErrorFromResponse(r);
    return shape.parse(await r.json());
  }
  async function post(path: string, input: object) {
    const r = await fetch(new URL('/admin/lot-setup/' + path, baseUrl), {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), ...input }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw await apiErrorFromResponse(r);
    return s.lotSetupResultSchema.parse(await r.json());
  }
  const id = (value: string) => encodeURIComponent(value);
  return {
    summary: () => get('summary', s.lotSetupSummarySchema),
    options: () => get('options', s.lotSetupOptionsSchema),
    // Categories
    categories: () => get('categories', s.categoryTreeSchema),
    category: (categoryId: string) =>
      get('categories/' + id(categoryId), s.categoryDetailSchema),
    saveCategory: (input: Change<typeof s.categorySaveSchema>) =>
      post('categories', input),
    orderCategories: (input: Change<typeof s.categoryOrderSchema>) =>
      post('categories/order', input),
    categoryVisibility: (input: Change<typeof s.categoryVisibilitySchema>) =>
      post('categories/visibility', input),
    moveCategoryLots: (input: Change<typeof s.categoryMoveLotsSchema>) =>
      post('categories/move-lots', input),
    deleteCategory: (input: Change<typeof s.lotSetupDeleteSchema>) =>
      post('categories/delete', input),
    // Pickup locations and bins
    locations: () => get('locations', s.locationListSchema),
    location: (locationId: string) =>
      get('locations/' + id(locationId), s.locationDetailSchema),
    staffOptions: (search?: string) =>
      get('staff-options', s.staffOptionsSchema, { search }),
    saveLocation: (input: Change<typeof s.locationSaveSchema>) =>
      post('locations', input),
    closeLocation: (input: Change<typeof s.locationCloseSchema>) =>
      post('locations/close', input),
    locationBinRule: (input: Change<typeof s.locationBinRuleSchema>) =>
      post('locations/bin-rule', input),
    locationStaff: (input: Change<typeof s.locationStaffSchema>) =>
      post('locations/staff', input),
    deleteLocation: (input: Change<typeof s.lotSetupDeleteSchema>) =>
      post('locations/delete', input),
    bins: (
      locationId: string,
      query: { status?: string; search?: string; cursor?: string } = {},
    ) => get('locations/' + id(locationId) + '/bins', s.binPageSchema, query),
    binLabels: (locationId: string, ids?: readonly string[]) =>
      get('locations/' + id(locationId) + '/bin-labels', s.binLabelsSchema, {
        ids: ids?.join(','),
      }),
    saveBin: (input: Change<typeof s.binSaveSchema>) => post('bins', input),
    addBins: (input: Change<typeof s.binBatchSchema>) =>
      post('bins/batch', input),
    deleteBin: (input: Change<typeof s.lotSetupDeleteSchema>) =>
      post('bins/delete', input),
    // Conditions, suppliers, brands
    conditions: () => get('conditions', s.conditionListSchema),
    saveCondition: (input: Change<typeof s.conditionSaveSchema>) =>
      post('conditions', input),
    orderConditions: (input: Change<typeof s.conditionOrderSchema>) =>
      post('conditions/order', input),
    suppliers: (
      query: { search?: string; cursor?: string; limit?: number } = {},
    ) => get('suppliers', s.supplierPageSchema, query),
    saveSupplier: (input: Change<typeof s.supplierSaveSchema>) =>
      post('suppliers', input),
    supplierActive: (input: Change<typeof s.activeToggleSchema>) =>
      post('suppliers/active', input),
    deleteSupplier: (input: Change<typeof s.lotSetupDeleteSchema>) =>
      post('suppliers/delete', input),
    brands: (
      query: { search?: string; cursor?: string; limit?: number } = {},
    ) => get('brands', s.brandPageSchema, query),
    saveBrand: (input: Change<typeof s.brandSaveSchema>) =>
      post('brands', input),
    mergeBrands: (input: Change<typeof s.brandMergeSchema>) =>
      post('brands/merge', input),
    deleteBrand: (input: Change<typeof s.lotSetupDeleteSchema>) =>
      post('brands/delete', input),
    // Deleted items: search, restore or delete permanently
    deletions: (
      query: { search?: string; cursor?: string; limit?: number } = {},
    ) =>
      get(
        'deletions',
        s.lotSetupDeletionPageSchema,
        s.lotSetupDeletionListSchema.parse(query),
      ),
    restoreDeleted: (input: Change<typeof s.lotSetupTrashActionSchema>) =>
      post('deleted/restore', input),
    purgeDeleted: (input: Change<typeof s.lotSetupTrashActionSchema>) =>
      post('deleted/purge', input),
  };
}
export type LotSetupClient = ReturnType<typeof createLotSetupClient>;
