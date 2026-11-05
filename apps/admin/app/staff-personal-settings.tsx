'use client';
import { useState } from 'react';
import { createAuthClient } from '@auction-ng/api-client/auth';
import { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { type TokenResponse, type StaffPreferences } from '@auction-ng/shared';
import { Input } from '@auction-ng/ui/web/input';
import { Button } from '@auction-ng/ui/web/button';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
export function StaffPersonalSettings({
  mode,
  session,
  apiUrl,
  deviceId,
  online,
  preferences,
  onSession,
  onSaved,
}: {
  mode: 'profile' | 'preferences';
  session: TokenResponse;
  apiUrl: string;
  deviceId: string;
  online: boolean;
  preferences: StaffPreferences;
  onSession: (s: TokenResponse) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(session.user.name),
    [settings, setSettings] = useState(preferences),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      if (mode === 'profile') {
        const user = await createAuthClient(apiUrl, {
          client: 'web',
          deviceId,
        }).updateProfile(session.accessToken, { name });
        onSession({ ...session, user });
      } else
        await createStaffAdminClient(apiUrl, {
          accessToken: session.accessToken,
          deviceId,
        }).savePreferences(settings);
      setMessage(mode === 'profile' ? 'Profile saved.' : 'Preferences saved.');
      onSaved();
    } catch {
      setError(
        'Changes could not be saved. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="lv-staff-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error && <StaffMessage>{error}</StaffMessage>}
      {message && <StaffMessage tone="success">{message}</StaffMessage>}
      {mode === 'profile' ? (
        <>
          <Input
            label="Full name"
            value={name}
            required
            minLength={2}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
          <Input label="Email" value={session.user.email ?? ''} readOnly />
          <p className="lv-staff-hint">
            Your email and staff permissions are managed separately from your
            display name.
          </p>
        </>
      ) : (
        <>
          <p className="lv-staff-hint">
            These settings apply only to your account. They do not change other
            staff accounts or notification delivery.
          </p>
          <label className="lv-staff-check">
            <input
              type="checkbox"
              checked={settings.compactTables}
              disabled={busy}
              onChange={(e) =>
                setSettings((v) => ({ ...v, compactTables: e.target.checked }))
              }
            />
            Compact table spacing
          </label>
          <label className="lv-staff-check">
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              disabled={busy}
              onChange={(e) =>
                setSettings((v) => ({ ...v, reduceMotion: e.target.checked }))
              }
            />
            Reduce interface motion
          </label>
        </>
      )}
      <Button type="submit" disabled={busy || !online}>
        {busy ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
