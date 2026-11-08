'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MonitorLot } from '@auction-ng/shared';
import { Button } from '../web/button';
import {
  MonitorActionMenu,
  type MonitorLotAction,
} from './monitor-action-menu';
export type BulkAction = 'message' | 'extend' | 'pause' | 'cancel';
export function MonitorBulkActions({
  rows,
  canControl,
  disabled,
  onSelect,
  onClear,
  portal,
}: {
  rows: MonitorLot[];
  canControl: boolean;
  disabled: boolean;
  onSelect: (action: BulkAction) => void;
  onClear: () => void;
  portal: (content: ReactNode) => ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (rows.length < 2 || disabled) setAnchor(null);
  }, [rows.length, disabled]);
  const close = useCallback(() => setAnchor(null), []);
  const select = (action: MonitorLotAction) => {
    close();
    if (['message', 'extend', 'pause', 'cancel'].includes(action))
      onSelect(action as BulkAction);
  };
  if (rows.length < 2 || !rows[0]) return null;
  return (
    <span className="lv-monitor-bulk-actions">
      <span>{rows.length} selected</span>
      <Button variant="danger" onClick={onClear} disabled={disabled}>
        Clear
      </Button>
      <Button
        onClick={(event) => {
          const trigger = event.currentTarget;
          setAnchor((current) => (current ? null : trigger));
        }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
      >
        Actions <ChevronDown size={15} aria-hidden="true" />
      </Button>
      {anchor &&
        portal(
          <MonitorActionMenu
            row={rows[0]}
            anchor={anchor}
            bulkCount={rows.length}
            canControl={canControl}
            canOpen={false}
            onSelect={select}
            onClose={close}
          />,
        )}
    </span>
  );
}
