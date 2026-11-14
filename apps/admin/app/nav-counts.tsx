'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { overviewRange, type OverviewResponse } from '@auction-ng/shared';
import { ApiError } from '@auction-ng/api-client/auth';
import { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';

const REFRESH_EVENTS = ['lotvanta:staff-refresh', 'focus', 'online'] as const;

type Row = { label: string; value: number };

/**
 * Sidebar work counters (pickup desk, lots, refunds). They used to be drawn
 * by the Overview page, so they vanished on every other page; the workspace
 * now keeps them on every page.
 */
export function NavCounts({
  apiUrl,
  accessToken,
  deviceId,
  enabled,
}: {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  /** Needs `dashboard.view`, like the Overview's Needs attention list. */
  enabled: boolean;
}) {
  const [rows, setRows] = useState<Row[]>();
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const client = createStaffAdminClient(apiUrl, { accessToken, deviceId });
    const read = () => {
      if (document.hidden || !navigator.onLine) return;
      client
        .overviewWidget('attention', {
          ...overviewRange('30'),
          compare: 'none',
          grain: 'day',
        })
        .then((value: OverviewResponse) => {
          if (!active) return;
          setRows(value.data?.rows ?? []);
          setDemo(value.mode === 'demo');
        })
        .catch((cause: unknown) => {
          // Keep the last confirmed counts; a signed-out answer goes to the
          // session watchdog.
          if (cause instanceof ApiError && cause.status === 401)
            window.dispatchEvent(new Event('lotvanta:staff-unauthorized'));
        });
    };
    read();
    const timer = setInterval(read, 60000);
    for (const event of REFRESH_EVENTS) window.addEventListener(event, read);
    return () => {
      active = false;
      clearInterval(timer);
      for (const event of REFRESH_EVENTS)
        window.removeEventListener(event, read);
    };
  }, [apiUrl, accessToken, deviceId, enabled]);

  // The sidebar slots exist once the shell has rendered.
  const [, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!rows) return null;
  const value = (label: string) =>
    rows.find((row) => row.label === label)?.value ?? 0;
  const overdue = value('Overdue pickups');
  const prepare = value('Items to prepare for pickup');
  const prefix = demo ? 'Demo · ' : '';
  const badges = [
    {
      id: 'overview-count-pickup-desk',
      count: overdue + prepare,
      danger: overdue > 0,
      title: `${prefix}${overdue} overdue, ${prepare} to prepare`,
    },
    {
      id: 'overview-count-lots',
      count: value('Draft lots to publish'),
      danger: false,
      title: `${prefix}Draft lots to publish`,
    },
    {
      id: 'overview-count-refunds-and-payouts',
      count: value('Refunds awaiting approval'),
      danger: false,
      title: `${prefix}Refunds awaiting approval`,
    },
  ];
  return (
    <>
      {badges.map(({ id, count, danger, title }) => {
        const target =
          typeof document === 'undefined' ? null : document.getElementById(id);
        return target && count > 0
          ? createPortal(
              <b className={danger ? 'is-danger' : undefined} title={title}>
                {count > 99 ? '99+' : count}
              </b>,
              target,
              id,
            )
          : null;
      })}
    </>
  );
}
