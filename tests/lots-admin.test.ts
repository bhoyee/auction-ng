import { describe, expect, it } from 'vitest';
import {
  allowedLotActions,
  DUPLICATE_LOT_FIELDS,
  duplicateLotFields,
  lotDeleteRule,
  lotEditLocks,
  lotStage,
  lotStages,
  type LotStage,
} from '../packages/shared/src/lots-admin';
import {
  lotCsvHeaders,
  nairaToKobo,
  validateLotCsv,
  type LotCsvContext,
} from '../packages/shared/src/lots-csv';

describe('lotStage', () => {
  it.each([
    ['draft', null, 'draft'],
    ['scheduled', null, 'scheduled'],
    ['open', null, 'live'],
    ['closing', null, 'live'],
    ['cancelled', null, 'cancelled'],
    ['closed', 'paid', 'sold'],
    ['closed', 'frozen', 'sold'],
    ['closed', 'payment_due', 'sold'],
    ['closed', 'unsold', 'unsold'],
    ['closed', 'defaulted', 'unsold'],
    ['closed', null, 'unsold'],
  ])('%s with settlement %s is %s', (status, settlementStatus, stage) => {
    expect(lotStage({ status, settlementStatus })).toBe(stage);
  });
});

describe('lotDeleteRule', () => {
  const roles = {
    admin: { canDeleteAny: true, canDeleteOwnDrafts: true },
    manager: { canDeleteAny: true, canDeleteOwnDrafts: true },
    intake: { canDeleteAny: false, canDeleteOwnDrafts: true },
    support: { canDeleteAny: false, canDeleteOwnDrafts: false },
  } as const;
  // stage, has bids, role, is creator → allowed / block
  it.each([
    ['draft', false, 'admin', false, 'allowed'],
    ['draft', false, 'manager', false, 'allowed'],
    ['draft', false, 'intake', true, 'allowed'],
    ['draft', false, 'intake', false, 'permission'],
    ['draft', false, 'support', true, 'permission'],
    ['scheduled', false, 'admin', false, 'allowed'],
    ['scheduled', false, 'intake', true, 'permission'],
    ['cancelled', false, 'manager', false, 'allowed'],
    ['live', false, 'admin', false, 'cancel-first'],
    ['live', true, 'admin', false, 'never'],
    ['live', true, 'intake', true, 'never'],
    ['sold', true, 'admin', false, 'archive-only'],
    ['unsold', false, 'admin', false, 'archive-only'],
  ] as const)(
    '%s (bids: %s) as %s (creator: %s) → %s',
    (stage, hasBids, role, isCreator, outcome) => {
      const result = lotDeleteRule({
        stage,
        hasBids,
        deleted: false,
        isCreator,
        ...roles[role],
      });
      if (outcome === 'allowed') expect(result.allowed).toBe(true);
      else expect(result).toMatchObject({ allowed: false, block: outcome });
    },
  );
  it('cancels the schedule when a scheduled lot is deleted', () => {
    expect(
      lotDeleteRule({
        stage: 'scheduled',
        hasBids: false,
        deleted: false,
        isCreator: false,
        canDeleteAny: true,
        canDeleteOwnDrafts: true,
      }),
    ).toEqual({ allowed: true, cancelsSchedule: true });
  });
  it('never deletes twice', () => {
    expect(
      lotDeleteRule({
        stage: 'draft',
        hasBids: false,
        deleted: true,
        isCreator: true,
        canDeleteAny: true,
        canDeleteOwnDrafts: true,
      }),
    ).toMatchObject({ allowed: false, block: 'done' });
  });
});

describe('lotEditLocks', () => {
  it.each([
    ['draft', false, true, false],
    ['scheduled', false, true, false],
    ['scheduled', true, true, true],
    ['live', false, true, true],
    ['live', true, true, true],
    ['sold', true, false, true],
    ['unsold', false, false, true],
    ['cancelled', false, false, true],
  ] as const)(
    '%s (bids: %s): editable %s, price locked %s',
    (stage, hasBids, editable, locked) => {
      const locks = lotEditLocks({ stage, hasBids });
      expect(locks.editable).toBe(editable);
      expect(locks.priceLocked).toBe(locked);
      expect(locks.runTimeLocked).toBe(locked || stage === 'scheduled');
      expect(locks.categoryLocked).toBe(locked);
    },
  );
  it('tells buyers about changes while live or pre-bid on', () => {
    for (const stage of lotStages)
      expect(lotEditLocks({ stage, hasBids: true }).tellBuyers).toBe(
        stage === 'live' || stage === 'scheduled',
      );
    expect(
      lotEditLocks({ stage: 'scheduled', hasBids: false }).tellBuyers,
    ).toBe(false);
  });
});

describe('duplicateLotFields', () => {
  it('copies the item fields and never photos, bin, history or IDs', () => {
    const source = {
      id: 'x',
      lotNumber: 'LOT-AAAA1111',
      title: 'Kenwood stand mixer',
      description: 'Works',
      condition: 'open_box',
      retailPriceKobo: 16_500_000,
      startPriceKobo: 500_000,
      fixedPriceKobo: null,
      categoryId: 'c',
      locationId: 'l',
      brandId: 'b',
      supplierId: 's',
      binId: 'bin',
      details: { colour: 'White' },
      included: ['Bowl'],
      defects: [],
      runTimeMinutes: 1440,
      images: ['photo'],
      createdAt: 'then',
    };
    const copy = duplicateLotFields(source);
    expect(Object.keys(copy).sort()).toEqual([...DUPLICATE_LOT_FIELDS].sort());
    for (const key of ['id', 'lotNumber', 'binId', 'images', 'createdAt'])
      expect(copy).not.toHaveProperty(key);
    expect(copy.title).toBe('Kenwood stand mixer');
  });
});

describe('allowedLotActions', () => {
  const base: {
    hasBids: boolean;
    archived: boolean;
    deleted: boolean;
    deletedAt: Date | null;
    now: Date;
    isCreator: boolean;
  } = {
    hasBids: false,
    archived: false,
    deleted: false,
    deletedAt: null,
    now: new Date('2026-11-14T10:00:00Z'),
    isCreator: false,
  };
  const admin = [
    'inventory.write',
    'records.archive',
    'lots.delete',
    'lots.relist',
    'auctions.manage',
    'records.purge',
  ];
  const actions = (
    stage: LotStage,
    permissions: string[],
    extra: Partial<typeof base> = {},
  ) => allowedLotActions({ ...base, stage, permissions, ...extra });
  it('hides what support staff can’t do', () => {
    expect(actions('draft', [])).toEqual(['view', 'print-label']);
  });
  it('offers delete on a live lot with bids so the block can be explained', () => {
    expect(actions('live', admin, { hasBids: true })).toContain('delete');
    expect(actions('live', admin, { hasBids: true })).not.toContain(
      'edit-price',
    );
  });
  it('archives ended lots but never deletes them', () => {
    expect(actions('sold', admin)).toContain('archive');
    expect(actions('sold', admin)).not.toContain('delete');
    expect(actions('unsold', admin)).toContain('relist');
  });
  it('lets intake delete only its own drafts', () => {
    expect(
      actions('draft', ['inventory.write'], { isCreator: true }),
    ).toContain('delete');
    expect(actions('draft', ['inventory.write'])).not.toContain('delete');
  });
  it('restores deleted lots for admins within 30 days only', () => {
    const deleted = { deleted: true };
    expect(
      actions('draft', admin, {
        ...deleted,
        deletedAt: new Date('2026-11-01T10:00:00Z'),
      }),
    ).toEqual(['view', 'restore']);
    expect(
      actions('draft', admin, {
        ...deleted,
        deletedAt: new Date('2026-10-01T10:00:00Z'),
      }),
    ).toEqual(['view']);
    expect(
      actions('draft', ['inventory.write'], {
        ...deleted,
        deletedAt: new Date('2026-11-13T10:00:00Z'),
      }),
    ).toEqual(['view']);
  });
});

describe('lots CSV', () => {
  // Excel adds this byte-order mark to UTF-8 files.
  const BOM = String.fromCharCode(0xfeff);
  const fields = [
    {
      key: 'storage',
      name: 'Storage',
      type: 'list' as const,
      required: true,
      options: ['128GB', '256GB'],
    },
    {
      key: 'imei_checked',
      name: 'IMEI checked',
      type: 'boolean' as const,
      required: false,
      options: [],
    },
  ];
  const ctx: LotCsvContext = {
    categoryId: '0b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60',
    fields,
    allowedConditions: ['new', 'like_new', 'open_box'],
    locations: new Map([['IKJ', '1b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60']]),
    bins: new Map([
      [
        '1b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60:S-01',
        '2b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60',
      ],
    ]),
    suppliers: new Map([
      ['konga returns', '3b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60'],
    ]),
    brands: new Map([['tecno', '4b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60']]),
  };
  const header = lotCsvHeaders(fields).join(',');
  const good =
    'Tecno Camon 30,Returned unused,Open box,"₦5,000",215000,24,IKJ,S-01,Konga returns,Tecno,Phone|Charger,Box dented,256GB,yes';

  it('reads Naira prices as kobo', () => {
    expect(nairaToKobo('₦5,000')).toBe(500_000);
    expect(nairaToKobo('12,500.5')).toBe(1_250_050);
    expect(nairaToKobo('12.345')).toBeNull();
    expect(nairaToKobo('free')).toBeNull();
  });

  it('turns a good row into a draft with its custom fields', () => {
    const result = validateLotCsv(`${BOM}${header}\n${good}\n`, ctx);
    expect(result.problems).toEqual([]);
    expect(result.good[0]?.lot).toMatchObject({
      title: 'Tecno Camon 30',
      condition: 'open_box',
      startPriceKobo: 500_000,
      retailPriceKobo: 21_500_000,
      runTimeMinutes: 1440,
      binId: '2b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60',
      included: ['Phone', 'Charger'],
      defects: ['Box dented'],
      details: { storage: '256GB', imei_checked: true },
    });
  });

  it('reports each problem by row and field in plain words', () => {
    const bad = ',No title,Damaged,abc,215000,200,XYZ,,Nobody,,,,64GB,maybe';
    const result = validateLotCsv(`${header}\n${good}\n${bad}\n`, ctx);
    expect(result.good).toHaveLength(1);
    const fieldsWithProblems = result.problems.map((p) => p.field);
    expect(fieldsWithProblems).toEqual([
      'title',
      'condition',
      'start_price',
      'run_time_hours',
      'pickup_location_code',
      'supplier',
      'detail:storage',
      'detail:imei_checked',
    ]);
    expect(result.problems.every((p) => p.row === 3)).toBe(true);
  });

  it('refuses a file with the wrong columns or more than 2,000 rows', () => {
    expect(() => validateLotCsv('title,price\nA,1\n', ctx)).toThrow(/template/);
    const many = Array.from({ length: 2_001 }, () => good).join('\n');
    expect(() => validateLotCsv(`${header}\n${many}\n`, ctx)).toThrow(/2,000/);
  });
});
