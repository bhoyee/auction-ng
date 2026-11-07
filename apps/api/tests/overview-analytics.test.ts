import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  comparisonRange,
  deltaIsGood,
  overviewQuerySchema,
  overviewRange,
  overviewResponseSchema,
  overviewWidgets,
  watDay,
  type StaffPermission,
} from '@auction-ng/shared';
import {
  buildOverviewDemo,
  overviewDemoAllowed,
} from '../src/staff-admin/overview-demo';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { ForbiddenException } from '@nestjs/common';

afterEach(() => vi.unstubAllEnvs());
const query = {
  from: '2026-10-09',
  to: '2026-11-07',
  compare: 'prev',
  grain: 'day',
} as const;
describe('Overview source boundary', () => {
  it.each([
    [{}, false],
    [{ ADMIN_OVERVIEW_DEMO_ENABLED: 'true' }, false],
    [
      { ADMIN_OVERVIEW_DEMO_ENABLED: 'true', DEPLOYMENT_ENV: 'production' },
      false,
    ],
    [{ ADMIN_OVERVIEW_DEMO_ENABLED: 'true', DEPLOYMENT_ENV: 'staging' }, false],
    [{ ADMIN_OVERVIEW_DEMO_ENABLED: 'false', DEPLOYMENT_ENV: 'local' }, false],
    [{ ADMIN_OVERVIEW_DEMO_ENABLED: 'true', DEPLOYMENT_ENV: 'local' }, true],
  ])('requires explicit local deployment and opt-in: %j', (env, allowed) =>
    expect(overviewDemoAllowed(env)).toBe(allowed),
  );
  it('produces bounded, typed fixtures with matching card, chart and category totals', () => {
    for (const widget of overviewWidgets)
      expect(
        overviewResponseSchema.safeParse({
          widget,
          mode: 'demo',
          updatedAt: new Date().toISOString(),
          data: buildOverviewDemo(widget, query),
        }).success,
      ).toBe(true);
    const cards = buildOverviewDemo('kpis', query).kpis;
    for (const grain of ['week', 'month'] as const) {
      expect(
        buildOverviewDemo('revenue', { ...query, grain }).series.reduce(
          (sum, row) => sum + row.value,
          0,
        ),
      ).toBe(cards[0]?.value);
    }
    expect(
      buildOverviewDemo('revenue', { ...query, grain: 'week' }).series.every(
        (row) => new Date(row.day + 'T00:00:00Z').getUTCDay() === 1,
      ),
    ).toBe(true);
    expect(cards.find((r) => r.id === 'netRevenue')?.value).toBe(
      buildOverviewDemo('revenue', query).series.reduce(
        (s, r) => s + r.value,
        0,
      ),
    );
    expect(cards.find((r) => r.id === 'gmv')?.value).toBe(
      buildOverviewDemo('categories', query).rows.reduce(
        (s, r) => s + r.value,
        0,
      ),
    );
    expect(
      buildOverviewDemo('revenue', { ...query, from: '2020-01-01' }).series
        .length,
    ).toBeLessThanOrEqual(400);
    expect(
      buildOverviewDemo('revenue', { ...query, compare: 'none' }).series.every(
        (row) => row.previous === null,
      ),
    ).toBe(true);
  });
  function service(permissions: StaffPermission[]) {
    const tx = new Proxy(
      {},
      {
        get(_target, key) {
          if (key === '$queryRaw')
            return async (parts: TemplateStringsArray) => {
              if (parts.join('').includes('FROM analytics_snapshots'))
                return [];
              throw Error('Unexpected non-projection query');
            };
          throw new Error(
            'Overview must not query operational or money tables',
          );
        },
      },
    );
    const instance = new StaffAdminService(
      {
        db: {
          $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
            work(tx),
        },
      } as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(instance, 'actor').mockImplementation(
      async (_tx, _who, permission) => {
        if (!permissions.includes(permission)) throw new ForbiddenException();
        return { user: {} as never, permissions, roleName: 'Admin' };
      },
    );
    return instance;
  }
  it('never replaces missing aggregates with hot-table estimates or unlabelled fixtures', async () => {
    vi.stubEnv('DEPLOYMENT_ENV', 'production');
    vi.stubEnv('ADMIN_OVERVIEW_DEMO_ENABLED', 'true');
    const result = await service([
      'dashboard.view',
      'finance.read',
    ]).overviewWidget({} as never, 'revenue', query);
    expect(result.mode).toBe('unavailable');
    expect(result.data).toBeUndefined();
  });
  it('enforces financial read permission before returning even demo financial figures', async () => {
    vi.stubEnv('DEPLOYMENT_ENV', 'local');
    vi.stubEnv('ADMIN_OVERVIEW_DEMO_ENABLED', 'true');
    await expect(
      service(['dashboard.view']).overviewWidget({} as never, 'revenue', query),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('only includes queues allowed by the current staff capabilities', async () => {
    vi.stubEnv('DEPLOYMENT_ENV', 'local');
    vi.stubEnv('ADMIN_OVERVIEW_DEMO_ENABLED', 'true');
    const result = await service([
      'dashboard.view',
      'support.manage',
    ]).overviewWidget({} as never, 'attention', query);
    expect(result.mode).toBe('demo');
    expect(result.data?.rows.map((r) => r.destination)).toEqual(['support']);
  });
});
describe('WAT range and metric presentation rules', () => {
  it('uses Lagos midnight rather than the device timezone', () => {
    expect(watDay(new Date('2026-11-07T23:30:00Z'))).toBe('2026-11-08');
    expect(overviewRange('30', new Date('2026-11-07T12:00:00Z'))).toEqual({
      from: '2026-10-09',
      to: '2026-11-07',
    });
    expect(comparisonRange(query)).toEqual({
      from: '2026-09-09',
      to: '2026-10-08',
    });
    expect(
      comparisonRange({
        ...query,
        from: '2024-02-29',
        to: '2024-03-01',
        compare: 'year',
      }),
    ).toEqual({ from: '2023-02-28', to: '2023-03-01' });
  });
  it('rejects invalid dates, reversed ranges and unknown fields', () => {
    expect(
      overviewQuerySchema.safeParse({
        ...query,
        from: '2020-01-01',
        grain: 'day',
      }).success,
    ).toBe(false);
    expect(
      overviewQuerySchema.safeParse({
        ...query,
        from: '2020-01-01',
        grain: 'week',
      }).success,
    ).toBe(true);
    expect(
      overviewQuerySchema.safeParse({
        ...query,
        from: '2010-01-01',
        grain: 'week',
      }).success,
    ).toBe(false);
    expect(
      overviewQuerySchema.safeParse({
        ...query,
        from: '2010-01-01',
        grain: 'month',
      }).success,
    ).toBe(true);
    expect(
      overviewQuerySchema.safeParse({ ...query, from: '2026-02-30' }).success,
    ).toBe(false);
    expect(
      overviewQuerySchema.safeParse({ ...query, from: '2027-01-01' }).success,
    ).toBe(false);
    expect(
      overviewQuerySchema.safeParse({ ...query, debug: true }).success,
    ).toBe(false);
  });
  it('treats a rising backlog as bad and rising net revenue as good', () => {
    expect(deltaIsGood('pickupBacklog', 8.4)).toBe(false);
    expect(deltaIsGood('netRevenue', 12.4)).toBe(true);
  });
});
