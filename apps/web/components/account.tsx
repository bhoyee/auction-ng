'use client';
import { useState } from 'react';
import { Button } from '@auction-ng/ui/web/button';
import { BuyerSkeleton, BuyerStack } from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { PasswordInput } from '@auction-ng/ui/web/password-input';
import { Input } from '@auction-ng/ui/web/input';
import { Textarea } from '@auction-ng/ui/web/textarea';
import { Toast } from '@auction-ng/ui/web/toast';
import {
  ProfileHeader,
  ProfileSection,
  ProfileFields,
  ProfileWideField,
  ProfileActions,
} from '@auction-ng/ui/web/profile';
import { useBuyer } from '../lib/session';
import { useOnline } from '../lib/network';

export function Account() {
  const { tokens } = useBuyer();
  return tokens ? <AccountForm key={tokens.user.id} /> : <BuyerSkeleton />;
}
function AccountForm() {
  const { tokens, auth, updateUser } = useBuyer();
  const online = useOnline();
  const [name, setName] = useState(tokens?.user.name ?? ''),
    [phone, setPhone] = useState(tokens?.user.phone ?? ''),
    [address, setAddress] = useState(tokens?.user.address ?? ''),
    [message, setMessage] = useState(''),
    [tone, setTone] = useState<'success' | 'error'>('success'),
    [busy, setBusy] = useState<'profile' | 'password' | null>(null),
    [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [passwordMessage, setPasswordMessage] = useState('');
  const disabled = busy !== null;
  if (!tokens) return null;
  return (
    <BuyerPage
      title="Profile"
      description="Manage your personal details and keep your account secure."
    >
      <BuyerStack>
        <ProfileHeader
          name={tokens.user.name}
          email={tokens.user.email}
          verified={tokens.user.emailVerified}
        />
        <ProfileSection
          title="Personal details"
          description="Keep your name and contact details up to date."
        >
          <form
            aria-label="Personal details"
            onInvalidCapture={() => {
              setTone('error');
              setMessage(
                'Check the highlighted fields before saving your profile.',
              );
            }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!auth || busy || !online) return;
              setBusy('profile');
              setMessage('');
              void auth
                .updateProfile(tokens.accessToken, { name, phone, address })
                .then((user) => {
                  updateUser(user);
                  setName(user.name);
                  setPhone(user.phone ?? '');
                  setAddress(user.address ?? '');
                  setTone('success');
                  setMessage('Your profile has been saved.');
                })
                .catch(() => {
                  setTone('error');
                  setMessage(
                    'Your details could not be saved. Check your phone number and connection, then try again.',
                  );
                })
                .finally(() => setBusy(null));
            }}
          >
            {message && (
              <Toast emphasis tone={tone} onClose={() => setMessage('')}>
                {message}
              </Toast>
            )}
            <ProfileFields>
              <Input
                label="Full name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={1}
                maxLength={120}
                required
                disabled={disabled}
              />
              <Input
                label="Email address"
                type="email"
                value={tokens.user.email}
                readOnly
                autoComplete="email"
                hint="Your sign-in email cannot be changed here."
              />
              <Input
                label="Phone number"
                type="tel"
                autoComplete="tel"
                placeholder="0803 123 4567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={32}
                disabled={disabled}
                hint="Optional. Phone verification is not available yet."
              />
              <ProfileWideField>
                <Textarea
                  label="Full address"
                  autoComplete="street-address"
                  rows={3}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  maxLength={1000}
                  disabled={disabled}
                  hint="Include your street, area, city and state."
                />
              </ProfileWideField>
            </ProfileFields>
            <ProfileActions>
              <Button
                type="submit"
                busy={busy === 'profile'}
                disabled={disabled || !online}
              >
                Save changes
              </Button>
            </ProfileActions>
          </form>
        </ProfileSection>
        <ProfileSection
          title="Change password"
          description="Use a unique password that you do not use for other accounts."
          security
        >
          {tokens.user.passwordSet ? (
            <form
              aria-label="Change password"
              onInvalidCapture={() =>
                setPasswordMessage(
                  'Check the password fields. Use at least 12 characters.',
                )
              }
              onSubmit={(event) => {
                event.preventDefault();
                if (!auth || busy || !online) return;
                setPasswordMessage('');
                if (password !== confirm) {
                  setPasswordMessage('The new passwords do not match.');
                  return;
                }
                setBusy('password');
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
                  .finally(() => setBusy(null));
              }}
            >
              {passwordMessage && (
                <Toast
                  emphasis
                  tone="error"
                  onClose={() => setPasswordMessage('')}
                >
                  {passwordMessage}
                </Toast>
              )}
              <p className="agn-profile-security-note">
                Changing your password signs you out on all devices. You will
                need your new password and an email code to sign in again.
              </p>
              <ProfileFields>
                <ProfileWideField>
                  <PasswordInput
                    label="Current password"
                    autoComplete="current-password"
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                    disabled={disabled}
                  />
                </ProfileWideField>
                <PasswordInput
                  label="New password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={disabled}
                  hint="Use at least 12 characters."
                />
                <PasswordInput
                  label="Confirm new password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={disabled}
                />
              </ProfileFields>
              <ProfileActions>
                <Button
                  type="submit"
                  busy={busy === 'password'}
                  disabled={disabled || !online}
                >
                  Change password
                </Button>
              </ProfileActions>
            </form>
          ) : (
            <p>
              <a className="agn-auth-inline-link" href="/forgot-password">
                Verify your email to set your first password
              </a>
            </p>
          )}
        </ProfileSection>
      </BuyerStack>
    </BuyerPage>
  );
}
