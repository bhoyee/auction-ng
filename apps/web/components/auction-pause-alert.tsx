'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AuctionPauseNotice } from '@auction-ng/ui/web/auction-pause-notice';
import { useBuyerRealtime } from '../lib/buyer-realtime';
const idle = () => () => {};
const key = 'lotvanta.pause-notice';
export function AuctionPauseAlert() {
  const client = useBuyerRealtime();
  useEffect(() => {
    client?.connect();
  }, [client]);
  const control = useSyncExternalStore(
    client?.subscribe ?? idle,
    () => client?.getControlSnapshot() ?? null,
    () => null,
  );
  const [dismissed, setDismissed] = useState<string>();
  const [resumed, setResumed] = useState(false);
  const lastPaused = useRef(false);
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(key) ?? undefined);
    } catch {
      /* Memory state remains usable. */
    }
  }, []);
  useEffect(() => {
    if (!control?.connected) return;
    if (lastPaused.current && !control.paused) setResumed(true);
    if (control.paused) setResumed(false);
    lastPaused.current = control.paused;
  }, [control?.revision, control?.connected]);
  useEffect(() => {
    if (!resumed) return;
    const timer = setTimeout(() => setResumed(false), 8000);
    return () => clearTimeout(timer);
  }, [resumed]);
  function dismiss() {
    if (!control) return;
    setDismissed(control.revision);
    try {
      sessionStorage.setItem(key, control.revision);
    } catch {
      /* Storage is optional; never block browsing. */
    }
  }
  return (
    <AuctionPauseNotice
      mode={control?.paused ? 'paused' : resumed ? 'resumed' : null}
      open={
        !!control?.connected && control.paused && dismissed !== control.revision
      }
      onClose={dismiss}
      onRead={() => setDismissed(undefined)}
    />
  );
}
