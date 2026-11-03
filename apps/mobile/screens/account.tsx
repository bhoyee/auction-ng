import { GuestMoreContent } from '../components/ui/guest-more';
import { PrivateQr } from '../components/ui/private-qr';
import { NativePreferences } from '../components/ui/preferences';
import { useState } from 'react';
import { View, Pressable, Share } from 'react-native';
import { useRouter } from 'expo-router';
import {
  UserRound,
  Wallet,
  PackageCheck,
  Heart,
  Gavel,
  ReceiptText,
  MessageCircle,
  QrCode,
  Truck,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react-native';
import { createTwoFactorClient } from '@auction-ng/api-client/two-factor';
import type {
  SecurityStart,
  SecurityEmailResult,
  SecurityResult,
} from '@auction-ng/shared';
import { Page, Private, Notice } from '../components/ui/page';
import { Body, Button, Input, Dialog } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { colors } from '../components/ui/styles';
import { useSession } from '../lib/session';
import { useLiveRead } from '../lib/live-read';
import { apiUrl } from '../lib/config';
import { Password, CodeInput } from './auth';
export function AccountScreen() {
  const { manager, session } = useSession();
  const router = useRouter();
  const [error, setError] = useState('');
  if (!session)
    return (
      <Page title="More" back={false}>
        <GuestMoreContent />
      </Page>
    );
  return (
    <Page title="More" back={false}>
      {session && (
        <View style={[n.surface, n.shade]}>
          <UserRound color={colors['indigo-900']} size={32} />
          <Body tone="section" style={n.bold}>
            {session?.user.name}
          </Body>
          <Body tone="secondary">{session?.user.email}</Body>
          <View style={n.row}>
            <ShieldCheck size={18} color={colors['win-600']} />
            <Body tone="fine">
              {session?.user.emailVerified
                ? 'Email verified'
                : 'Verify your email before bidding'}
            </Body>
          </View>
        </View>
      )}
      {[
        { label: 'Check-in', path: '/check-in', icon: QrCode },
        { label: 'Wallet', path: '/wallet', icon: Wallet },
        { label: 'Awaiting pickup', path: '/orders', icon: PackageCheck },
        { label: 'Shipments', path: '/shipments', icon: Truck },
        { label: 'Watchlist', path: '/watchlist', icon: Heart },
        { label: 'Purchase history', path: '/purchases', icon: ReceiptText },
        { label: 'Bid history', path: '/bids', icon: Gavel },
        { label: 'Profile and security', path: '/profile', icon: UserRound },
        { label: 'Customer Service', path: '/support', icon: MessageCircle },
      ].map((item) => (
        <Pressable
          accessibilityRole="button"
          key={item.path}
          style={n.link}
          onPress={() => router.push(item.path as '/')}
        >
          <View style={n.row}>
            <item.icon color={colors['indigo-900']} size={21} />
            <Body style={n.bold}>{item.label}</Body>
          </View>
          <ChevronRight color={colors['slate-600']} size={18} />
        </Pressable>
      ))}
      <NativePreferences />
      <Notice message={error} />
      {session ? (
        <Button
          variant="danger"
          onPress={() =>
            void manager
              .logout()
              .then(() => router.replace('/'))
              .catch(() =>
                setError(
                  'Sign out could not complete. Check your connection and retry.',
                ),
              )
          }
        >
          Sign out
        </Button>
      ) : (
        <Button onPress={() => router.push('/sign-in')}>
          Log in or create an account
        </Button>
      )}
    </Page>
  );
}
export function ProfileScreen({ back = true }: { back?: boolean } = {}) {
  const { session } = useSession();
  return (
    <Page title="Profile and security" back={back}>
      <Private>
        <ProfileFields key={session?.user.id} />
      </Private>
    </Page>
  );
}
function ProfileFields() {
  const { session, manager, online } = useSession();
  const router = useRouter();
  const [name, setName] = useState(session?.user.name ?? ''),
    [phone, setPhone] = useState(session?.user.phone ?? ''),
    [address, setAddress] = useState(session?.user.address ?? ''),
    [password, setPassword] = useState(''),
    [nextPassword, setNextPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [purpose, setPurpose] = useState<SecurityStart['purpose']>(),
    [securityId, setSecurityId] = useState(''),
    [emailCode, setEmailCode] = useState(''),
    [factor, setFactor] = useState(''),
    [recovery, setRecovery] = useState(false),
    [setup, setSetup] = useState<SecurityEmailResult>(),
    [newCode, setNewCode] = useState(''),
    [result, setResult] = useState<SecurityResult>();
  const security = useLiveRead(
    () => manager.run((c) => createTwoFactorClient(apiUrl, c).status()),
    [session?.user.id],
  );
  async function save() {
    setBusy(true);
    try {
      await manager.run((c) =>
        manager.auth.updateProfile(c.accessToken, {
          name,
          phone: phone || null,
          address: address || null,
        }),
      );
      await manager.renew();
      setMessage('Your profile has been saved.');
    } catch {
      setError(
        'Could not save details. Check your phone number and connection.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function begin(p: SecurityStart['purpose']) {
    setPurpose(p);
    setSetup(undefined);
    setSecurityId('');
    setEmailCode('');
    setFactor('');
    setResult(undefined);
  }
  async function securityStep() {
    if (!purpose) return;
    setBusy(true);
    setError('');
    try {
      if (!securityId) {
        if (purpose === 'change-password' && nextPassword !== confirm)
          throw Error('New passwords must match.');
        if (purpose === 'change-password' && !security.data?.enabled) {
          await manager.run((c) =>
            manager.auth.changePassword(c.accessToken, password, nextPassword),
          );
          await manager.invalidate();
          router.replace('/sign-in');
          return;
        }
        const result = await manager.run((c) =>
          createTwoFactorClient(apiUrl, c).start({
            purpose,
            password,
            ...(purpose === 'change-password'
              ? { newPassword: nextPassword }
              : {}),
          }),
        );
        setSecurityId(result.id);
      } else if (!setup) {
        setSetup(
          await manager.run((c) =>
            createTwoFactorClient(apiUrl, c).email({
              id: securityId,
              code: emailCode,
            }),
          ),
        );
        setEmailCode('');
      } else if (purpose === 'change-password') {
        await manager.run((c) =>
          manager.auth.changePassword(c.accessToken, password, nextPassword, {
            securityChallengeId: securityId,
            factor: {
              method: recovery ? 'recovery' : 'authenticator',
              code: factor,
            },
          }),
        );
        setPassword('');
        setNextPassword('');
        setConfirm('');
        await manager.logout();
        router.replace('/sign-in');
      } else {
        const saved = await manager.run((c) =>
          createTwoFactorClient(apiUrl, c).finish({
            id: securityId,
            factor: security.data?.enabled
              ? {
                  method: recovery ? 'recovery' : 'authenticator',
                  code: factor,
                }
              : undefined,
            newCode: setup.secret ? newCode : undefined,
          }),
        );
        setResult(saved);
        setPassword('');
        setFactor('');
        setNewCode('');
        security.refresh();
        await manager.renew();
        setMessage('Account security updated.');
      }
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'New passwords must match.'
          ? cause.message
          : 'Security verification failed. Check your password, email code and authenticator, then retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Notice message={error} onClose={() => setError('')} />
      <Notice tone="success" message={message} onClose={() => setMessage('')} />
      <View style={n.surface}>
        <Body tone="section">Personal details</Body>
        <Input label="Full name" value={name} onChangeText={setName} />
        <Input
          label="Email address"
          value={session?.user.email ?? ''}
          editable={false}
        />
        <Body tone="fine">
          {session?.user.emailVerified
            ? 'Verified email. Your sign-in address is read-only.'
            : 'Email verification required.'}
        </Body>
        <Input
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Input
          label="Full address"
          value={address}
          onChangeText={setAddress}
          multiline
        />
        <Button busy={busy} disabled={!online} onPress={() => void save()}>
          Save changes
        </Button>
      </View>
      <View style={n.surface}>
        <Body tone="section">Password and security</Body>
        <Body tone="secondary">
          Keep a strong, unique password and add an authenticator to protect
          your wallet.
        </Body>
        <Button onPress={() => void begin('change-password')}>
          Change password
        </Button>
        <View style={n.between}>
          <Body>Authenticator 2FA</Body>
          <Body style={n.bold}>
            {security.data?.enabled ? 'Enabled' : 'Not enabled'}
          </Body>
        </View>
        <Button
          disabled={!security.data}
          onPress={() =>
            void begin(security.data?.enabled ? 'disable' : 'enable')
          }
        >
          {security.data?.enabled
            ? 'Disable authenticator'
            : 'Enable authenticator'}
        </Button>
        {security.data?.enabled && (
          <>
            <Body tone="secondary">
              Recovery codes remaining: {security.data.recoveryCodesRemaining}
            </Body>
            <Button onPress={() => void begin('rotate')}>
              Replace authenticator
            </Button>
            <Button onPress={() => void begin('recovery')}>
              Replace recovery codes
            </Button>
          </>
        )}
      </View>
      <Dialog
        open={!!purpose}
        title={
          purpose === 'change-password'
            ? 'Change password'
            : 'Authenticator security'
        }
        presentation="sheet"
        onClose={() => {
          if (!busy) {
            setPurpose(undefined);
            setSetup(undefined);
            setResult(undefined);
            setPassword('');
            setNextPassword('');
            setConfirm('');
            setFactor('');
            setNewCode('');
          }
        }}
      >
        <View style={n.content}>
          <Notice message={error} />
          {result ? (
            <>
              <Body style={n.bold}>Security updated</Body>
              {result.recoveryCodes && (
                <>
                  <Notice
                    tone="warning"
                    message="Save these recovery codes privately. Each can be used only once, after email verification."
                  />
                  {result.recoveryCodes.map((code) => (
                    <Body selectable key={code}>
                      {code}
                    </Body>
                  ))}
                  <Button
                    onPress={() =>
                      void Share.share({
                        message: result.recoveryCodes?.join('\n') ?? '',
                      })
                    }
                  >
                    Save recovery codes
                  </Button>
                </>
              )}
              <Button
                onPress={() => {
                  setPurpose(undefined);
                  setResult(undefined);
                  setSetup(undefined);
                }}
              >
                I have saved my codes
              </Button>
            </>
          ) : (
            <>
              {!securityId ? (
                <>
                  <Password
                    label="Current password"
                    value={password}
                    onChange={setPassword}
                  />
                  {purpose === 'change-password' && (
                    <>
                      <Password
                        label="New password"
                        value={nextPassword}
                        onChange={setNextPassword}
                      />
                      <Password
                        label="Confirm new password"
                        value={confirm}
                        onChange={setConfirm}
                      />
                    </>
                  )}
                </>
              ) : !setup ? (
                <>
                  <Body>
                    Enter the security code sent to your verified email.
                  </Body>
                  <CodeInput value={emailCode} onChange={setEmailCode} />
                </>
              ) : (
                <>
                  {setup.secret && (
                    <>
                      {setup.uri && (
                        <PrivateQr
                          value={setup.uri}
                          label="Private authenticator setup QR code"
                        />
                      )}
                      <Body>
                        Add this private key to Google Authenticator. Never
                        share it.
                      </Body>
                      <Body selectable style={n.bold}>
                        {setup.secret}
                      </Body>
                      <Input
                        label="New authenticator code"
                        value={newCode}
                        onChangeText={setNewCode}
                        keyboardType="number-pad"
                      />
                    </>
                  )}
                  {security.data?.enabled && (
                    <>
                      <Input
                        label={
                          recovery
                            ? 'Recovery code'
                            : 'Current authenticator code'
                        }
                        value={factor}
                        onChangeText={setFactor}
                      />
                      <Button
                        variant="ghost"
                        onPress={() => setRecovery((v) => !v)}
                      >
                        {recovery ? 'Use authenticator' : 'Use recovery code'}
                      </Button>
                    </>
                  )}
                </>
              )}
              <Button busy={busy} onPress={() => void securityStep()}>
                {!securityId
                  ? 'Continue securely'
                  : !setup
                    ? 'Verify email code'
                    : 'Confirm security change'}
              </Button>
            </>
          )}
        </View>
      </Dialog>
    </>
  );
}
