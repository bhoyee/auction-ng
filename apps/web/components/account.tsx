'use client';
import { useState } from 'react';
import { Badge } from '@auction-ng/ui/web/auction';
import { Button } from '@auction-ng/ui/web/button';
import { BuyerPanel, BuyerStack } from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { Input } from '@auction-ng/ui/web/input';
import { Check } from '@auction-ng/ui/web/icons';
import { useBuyer } from '../lib/session';
export function Account() {
  const { tokens, auth, updateUser } = useBuyer();
  const [name, setName] = useState(tokens?.user.name ?? ''),
    [phone, setPhone] = useState(tokens?.user.phone ?? ''),
    [address, setAddress] = useState(tokens?.user.address ?? ''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [passwordMessage, setPasswordMessage] = useState('');
  return (
    <BuyerPage
      title="Profile"
      description="Your personal details and account security."
    >
      <BuyerStack>
        <BuyerPanel>
          <BuyerStack>
            <h2>Personal details</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!tokens || !auth || busy) return;
                setBusy(true);
                setMessage('');
                void auth
                  .updateProfile(tokens.accessToken, { name, phone, address })
                  .then((user) => {
                    updateUser(user);
                    setPhone(user.phone ?? '');
                    setAddress(user.address ?? '');
                    setMessage('Your profile has been saved.');
                  })
                  .catch(() =>
                    setMessage(
                      'Your details could not be saved. Check your phone number and connection, then try again.',
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <BuyerStack>
                <Input
                  label="Full name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={1}
                  maxLength={120}
                  required
                />
                <Input
                  label="Email address"
                  type="email"
                  value={tokens?.user.email ?? ''}
                  readOnly
                  autoComplete="email"
                  hint="Your sign-in email cannot be changed here."
                />
                {tokens?.user.emailVerified && (
                  <Badge tone="win">
                    <Check size={16} aria-hidden="true" /> Email verified
                  </Badge>
                )}
                <Input
                  label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  placeholder="0803 123 4567"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={32}
                  hint="Optional. Saving a phone number does not verify it."
                />
                <Input
                  label="Full address"
                  autoComplete="street-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  maxLength={1000}
                  hint="Include your street, area, city and state."
                />
                <Button type="submit" busy={busy}>
                  Save profile
                </Button>
                {message && <p role="status">{message}</p>}
              </BuyerStack>
            </form>
          </BuyerStack>
        </BuyerPanel>
        <BuyerPanel>
          <BuyerStack>
            <h2>Change password</h2>
            <p>
              Use a unique password for Auction NG. Changing it signs you out on
              all devices.
            </p>
            {tokens?.user.passwordSet ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!auth || !tokens || busy) return;
                  setPasswordMessage('');
                  if (password !== confirm) {
                    setPasswordMessage('The new passwords do not match.');
                    return;
                  }
                  setBusy(true);
                  void auth
                    .changePassword(tokens.accessToken, current, password)
                    .then(() =>
                      window.location.replace('/sign-in?passwordChanged=1'),
                    )
                    .catch(() =>
                      setPasswordMessage(
                        'Your password could not be changed. Check your current password and try again.',
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <BuyerStack>
                  <PasswordInput
                    label="Current password"
                    autoComplete="current-password"
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                  />
                  <PasswordInput
                    label="New password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    hint="Use at least 12 characters."
                    required
                  />
                  <PasswordInput
                    label="Confirm new password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                  />
                  <Button type="submit" busy={busy}>
                    Change password
                  </Button>
                  {passwordMessage && <p role="alert">{passwordMessage}</p>}
                </BuyerStack>
              </form>
            ) : (
              <p>
                <a className="agn-auth-inline-link" href="/forgot-password">
                  Verify your email to set your first password
                </a>
              </p>
            )}
          </BuyerStack>
        </BuyerPanel>
      </BuyerStack>
    </BuyerPage>
  );
}
