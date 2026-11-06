'use client';
import { useEffect, useRef, useState } from 'react';
import { createPickupVisitClient } from '@auction-ng/api-client/pickup-visits';
import { ApiError } from '@auction-ng/api-client/auth';
import type { PickupVisit } from '@auction-ng/shared/pickup-visit-schemas';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import { Button } from '@auction-ng/ui/web/button';
import { PickupCamera } from '@auction-ng/ui/web/pickup-camera';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export function CheckInBuyer({
  accessToken,
  deviceId,
  online,
  onClose,
  onRegistered,
}: {
  accessToken: string;
  deviceId: string;
  online: boolean;
  onClose: () => void;
  onRegistered: (visit: PickupVisit) => void;
}) {
  const [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false);
  const returnFocus = useRef(document.activeElement);
  useEffect(
    () => () => {
      const trigger = returnFocus.current;
      requestAnimationFrame(() => {
        if (trigger instanceof HTMLElement && trigger.isConnected)
          trigger.focus();
      });
    },
    [],
  );
  async function scan(value: string) {
    if (running.current || !online) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const visit = await createPickupVisitClient(apiUrl, {
        accessToken,
        deviceId,
      }).scan(value.trim());
      onRegistered(visit);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 429
          ? 'Too many scans. Wait before trying again.'
          : 'Pass could not be accepted. Check the code, expiry and connection, then try again.',
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title="Check in a buyer"
      onClose={() => {
        if (!running.current) onClose();
      }}
    >
      <p>
        Scan the buyer’s arrival pass or enter its 8-character code. This
        registers their arrival; items are only marked collected after a
        separate handover confirmation.
      </p>
      {!online && (
        <StaffMessage>Reconnect before checking in a buyer.</StaffMessage>
      )}
      {error && <StaffMessage>{error}</StaffMessage>}
      <form
        className="agn-visit-scan-form"
        onSubmit={(event) => {
          event.preventDefault();
          void scan(code);
        }}
      >
        <Input
          label="Scan pass or enter code"
          autoComplete="off"
          value={code}
          disabled={busy || !online}
          onChange={(event) => setCode(event.target.value)}
        />
        <Button
          type="submit"
          className="lv-staff-checkin-action"
          busy={busy}
          disabled={!code.trim() || !online}
        >
          Register arrival
        </Button>
      </form>
      <PickupCamera
        disabled={busy || !online}
        onScan={(value) => {
          setCode(value);
          void scan(value);
        }}
      />
    </Dialog>
  );
}
