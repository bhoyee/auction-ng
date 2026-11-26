'use client';
import { useMemo } from 'react';
import { createTwoFactorClient } from '@auction-ng/api-client/two-factor';
import { createStaffAuthClient } from '@auction-ng/api-client/staff-auth';
import { TwoFactorSettings } from '@auction-ng/ui/web/two-factor-settings';
import { StaffPasswordChange } from '@auction-ng/ui/web/staff-password-change';

export function StaffAccountSecurity({
  apiUrl,
  accessToken,
  deviceId,
  online,
  onPasswordChanged,
  onRequireSignIn,
}: {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  online: boolean;
  onPasswordChanged(): void;
  onRequireSignIn(): void;
}) {
  const security = useMemo(
    () => createTwoFactorClient(apiUrl, { accessToken, deviceId }),
    [apiUrl, accessToken, deviceId],
  );
  const auth = useMemo(
    () => createStaffAuthClient(apiUrl, deviceId),
    [apiUrl, deviceId],
  );
  return (
    <>
      <TwoFactorSettings client={security} />
      <StaffPasswordChange
        security={security}
        changePassword={(value) => auth.changePassword(accessToken, value)}
        online={online}
        onChanged={onPasswordChanged}
        onRequireSignIn={onRequireSignIn}
      />
    </>
  );
}
