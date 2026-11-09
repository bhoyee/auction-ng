import { merchandisingRules } from '@auction-ng/shared';
import { countdown } from '@auction-ng/ui/presentation';

export function auctionCountdown({
  endsAt,
  serverNow,
  live = true,
  upcoming = false,
  closed = false,
  paused = false,
}: {
  endsAt: number;
  serverNow: number;
  live?: boolean;
  upcoming?: boolean;
  closed?: boolean;
  paused?: boolean;
}) {
  if (closed)
    return {
      label: 'Auction ended',
      message: 'Ended',
      urgent: false,
      segments: [],
    };
  if (!Number.isFinite(serverNow) || serverNow <= 0)
    return {
      label: 'Syncing server time',
      message: 'Syncing time',
      urgent: false,
      segments: [],
    };
  if (!live && !upcoming)
    return {
      label: 'Reconnecting. Waiting for the latest auction update.',
      message: 'Reconnecting',
      urgent: false,
      segments: [],
    };
  if (paused)
    return {
      label: 'Paused by LotVanta',
      message: 'Paused by LotVanta',
      urgent: false,
      segments: [],
    };
  if (!Number.isFinite(endsAt))
    return {
      label: 'Waiting for the auction schedule',
      message: 'Checking time',
      urgent: false,
      segments: [],
    };
  if (endsAt <= serverNow)
    return {
      label: upcoming ? 'Waiting for the auction to go live' : 'Auction ended',
      message: upcoming ? 'Going live soon' : 'Ended',
      urgent: false,
      segments: [],
    };
  const value = countdown(endsAt, serverNow, { showSeconds: true });
  return {
    label: upcoming ? 'Goes live in ' + value.label : value.label,
    message: '',
    urgent:
      !upcoming && endsAt - serverNow <= merchandisingRules.closingWindowMs,
    segments: value.segments,
  };
}
