'use client';
import { useEffect, useRef, useState } from 'react';

import {
  History,
  ExternalLink,
  MessageSquare,
  Timer,
  Pause,
  Play,
  Ban,
} from 'lucide-react';
import type { MonitorLot } from '@auction-ng/shared';
export type MonitorLotAction =
  'history' | 'open' | 'message' | 'extend' | 'pause' | 'resume' | 'cancel';
export function MonitorActionMenu({
  row,
  anchor,
  canControl,
  canOpen,
  closed = false,
  onSelect,
  onClose,
  bulkCount,
}: {
  row: MonitorLot;
  anchor: HTMLElement;
  canControl: boolean;
  canOpen: boolean;
  closed?: boolean;
  onSelect: (action: MonitorLotAction) => void;
  onClose: () => void;
  bulkCount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useEffect(() => {
    const place = () => {
      const bounds = anchor.getBoundingClientRect(),
        height = ref.current?.offsetHeight ?? 320;
      setPosition({
        left: Math.max(
          8,
          Math.min(bounds.right - 248, window.innerWidth - 256),
        ),
        top: Math.max(
          8,
          bounds.bottom + height + 8 > window.innerHeight
            ? bounds.top - height - 4
            : bounds.bottom + 4,
        ),
      });
    };
    place();
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (
        e.target instanceof Node &&
        !ref.current?.contains(e.target) &&
        !anchor.contains(e.target)
      )
        onClose();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor, onClose]);
  const items = [
    { key: 'history', text: 'View bid history', Icon: History },
    { key: 'open', text: 'Open lot', Icon: ExternalLink },
    { key: 'message', text: 'Message bidders', Icon: MessageSquare },
    ...(canControl
      ? [
          { key: 'extend', text: 'Extend bid time', Icon: Timer },
          {
            key: !bulkCount && row.individuallyPaused ? 'resume' : 'pause',
            text:
              !bulkCount && row.individuallyPaused ? 'Resume lot' : 'Pause lot',
            Icon: !bulkCount && row.individuallyPaused ? Play : Pause,
          },
          { key: 'cancel', text: 'Cancel lot', Icon: Ban },
        ]
      : []),
  ].filter(
    (item) =>
      (item.key !== 'open' || canOpen) &&
      (!bulkCount || !['history', 'open'].includes(item.key)) &&
      (!closed || ['history', 'open'].includes(item.key)),
  );
  return (
    <div
      ref={ref}
      className="lv-monitor-action-menu"
      role="menu"
      aria-label={
        bulkCount
          ? 'Actions for ' + bulkCount + ' selected lots'
          : 'Actions for ' + row.reference
      }
      style={position}
      onKeyDown={(e) => {
        const buttons = Array.from(
            ref.current?.querySelectorAll('button') ?? [],
          ),
          index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          buttons[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? buttons.length - 1
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                  buttons.length
          ]?.focus();
        }
        if (e.key === 'Tab') onClose();
      }}
    >
      {items.map(({ key, text, Icon }) => (
        <button
          type="button"
          role="menuitem"
          className={key === 'cancel' ? 'is-danger' : ''}
          key={key}
          onClick={() => onSelect(key as MonitorLotAction)}
        >
          <Icon size={17} aria-hidden="true" />
          {text}
        </button>
      ))}
    </div>
  );
}
