'use client';
import { CirclePause, CircleCheck } from 'lucide-react';
import { auctionPauseCopy } from '@auction-ng/shared/realtime';
import { Dialog } from './dialog';
import { Button } from './button';
export function AuctionPauseNotice({
  mode,
  open,
  onClose,
  onRead,
}: {
  mode: 'paused' | 'resumed' | null;
  open: boolean;
  onClose: () => void;
  onRead: () => void;
}) {
  return (
    <>
      {mode && (
        <aside role="status" className={'agn-pause-banner is-' + mode}>
          {mode === 'paused' ? (
            <CirclePause size={20} aria-hidden="true" />
          ) : (
            <CircleCheck size={20} aria-hidden="true" />
          )}
          <strong>
            {mode === 'paused'
              ? auctionPauseCopy.banner
              : auctionPauseCopy.resumed}
          </strong>
          {mode === 'paused' && (
            <Button variant="ghost" onClick={onRead}>
              Read update
            </Button>
          )}
        </aside>
      )}
      <Dialog open={open} title={auctionPauseCopy.title} onClose={onClose}>
        <div className="agn-pause-notice">
          <div className="agn-pause-notice-icon">
            <CirclePause size={36} aria-hidden="true" />
          </div>
          <p>{auctionPauseCopy.body}</p>
          <p>{auctionPauseCopy.reassurance}</p>
          <p className="agn-pause-payment-note">{auctionPauseCopy.payments}</p>
          <Button onClick={onClose}>{auctionPauseCopy.action}</Button>
        </div>
      </Dialog>
    </>
  );
}
