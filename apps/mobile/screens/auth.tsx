import { useState, useRef, type ComponentRef } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react-native';
import { Page, Notice } from '../components/ui/page';
import { Body, Button, Input, Tabs } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { colors } from '../components/ui/styles';
import { useSession } from '../lib/session';
import { safeMobilePath } from '../lib/config';
import { ApiError } from '@auction-ng/api-client/auth';
export function Password({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={n.row}>
      <View style={n.grow}>
        <Input
          label={label}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <Pressable
        style={n.icon}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        onPress={() => setVisible((v) => !v)}
      >
        {visible ? (
          <EyeOff color={colors['indigo-900']} />
        ) : (
          <Eye color={colors['indigo-900']} />
        )}
      </Pressable>
    </View>
  );
}
export function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  const refs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);
  return (
    <View style={n.otp}>
      {Array.from({ length: 6 }, (_, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          accessibilityLabel={i === 0 ? 'Six-digit code' : `Digit ${i + 1}`}
          value={value[i] ?? ''}
          keyboardType="number-pad"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? 6 : 1}
          style={n.digit}
          onChangeText={(text) => {
            const digits = text.replace(/\D/g, '');
            if (digits.length > 1) {
              onChange(digits.slice(0, 6));
              refs.current[5]?.focus();
              return;
            }
            const next = value.split('');
            next[i] = digits;
            onChange(next.join('').slice(0, 6));
            if (digits) refs.current[Math.min(i + 1, 5)]?.focus();
          }}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && !value[i])
              refs.current[Math.max(0, i - 1)]?.focus();
          }}
        />
      ))}
    </View>
  );
}
export default function AuthScreen() {
  const { manager, ready } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const [mode, setMode] = useState('login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [name, setName] = useState(''),
    [challenge, setChallenge] = useState(''),
    [code, setCode] = useState(''),
    [factor, setFactor] = useState(''),
    [factorRequired, setFactorRequired] = useState(false),
    [recovery, setRecovery] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      if (!challenge) {
        if (mode === 'signup' && password !== confirm)
          throw Error('Passwords must match.');
        const result = await manager.auth.requestCode(
          email,
          password,
          mode === 'reset' ? 'reset' : mode === 'signup' ? 'signup' : 'login',
          name,
        );
        setChallenge(result.challengeId);
        setPassword('');
        setConfirm('');
      } else if (mode === 'reset') {
        if (password !== confirm) throw Error('Passwords must match.');
        await manager.auth.resetPassword(
          challenge,
          code,
          password,
          factorRequired
            ? { method: recovery ? 'recovery' : 'authenticator', code: factor }
            : undefined,
        );
        await manager.invalidate();
        setChallenge('');
        setMode('login');
        setPassword('');
        setCode('');
        setError('Password updated. Sign in with your new password.');
      } else {
        const result = await manager.auth.verifyCode(
          challenge,
          code,
          factorRequired
            ? { method: recovery ? 'recovery' : 'authenticator', code: factor }
            : undefined,
        );
        await manager.signIn(result);
        setCode('');
        setFactor('');
        router.replace(safeMobilePath(params.next) as '/');
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.code?.startsWith('TWO_FACTOR')) {
        setFactorRequired(true);
        setError(
          cause.code === 'TWO_FACTOR_INVALID'
            ? 'Check your authenticator or recovery code.'
            : 'Enter your authenticator code to finish signing in.',
        );
      } else
        setError(
          cause instanceof ApiError
            ? cause.status === 429
              ? 'Too many attempts. Wait before trying again.'
              : cause.status === 401
                ? 'Invalid email or password.'
                : challenge
                  ? 'The code could not be verified. Check it and retry.'
                  : 'Check your details and connection, then retry.'
            : cause instanceof Error
              ? cause.message
              : 'Something went wrong. Retry.',
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title={
        challenge
          ? 'Verify your email'
          : mode === 'signup'
            ? 'Join Auction NG'
            : mode === 'reset'
              ? 'Reset password'
              : 'Welcome back'
      }
    >
      <View style={n.row}>
        <ShieldCheck size={28} color={colors['indigo-900']} />
        <Body tone="section" style={n.brand}>
          Your next win starts here.
        </Body>
      </View>
      <Body tone="secondary">
        One account for the app and website. Your wallet and bids stay in sync.
      </Body>
      <Notice message={error} onClose={() => setError('')} />
      {!challenge ? (
        <>
          <Tabs
            label="Account access"
            items={['Sign in', 'Create account'].map((value) => ({
              value,
              label: value,
              panel: null,
            }))}
            value={mode === 'signup' ? 'Create account' : 'Sign in'}
            onChange={(label) => {
              setMode(label === 'Sign in' ? 'login' : 'signup');
              setError('');
            }}
          />
          {mode === 'signup' && (
            <Input
              label="Full name"
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
          )}
          <Input
            label="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {mode !== 'reset' && (
            <Password
              label="Password"
              value={password}
              onChange={setPassword}
            />
          )}
          {mode === 'signup' && (
            <Password
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
            />
          )}
        </>
      ) : (
        <>
          <Body>Enter the code sent to {email}.</Body>
          <CodeInput value={code} onChange={setCode} />
          {mode === 'reset' && (
            <>
              <Password
                label="New password"
                value={password}
                onChange={setPassword}
              />
              <Password
                label="Confirm password"
                value={confirm}
                onChange={setConfirm}
              />
            </>
          )}
          {factorRequired && (
            <>
              <Input
                label={recovery ? 'Recovery code' : 'Authenticator code'}
                value={factor}
                onChangeText={setFactor}
                autoCapitalize="none"
              />
              <Button variant="ghost" onPress={() => setRecovery((v) => !v)}>
                {recovery ? 'Use authenticator' : 'Use a recovery code'}
              </Button>
            </>
          )}
        </>
      )}
      <Button
        busy={busy}
        disabled={!ready}
        fullWidth
        onPress={() => void submit()}
      >
        {challenge
          ? 'Verify and continue'
          : mode === 'reset'
            ? 'Send recovery code'
            : 'Continue securely'}
      </Button>
      {challenge ? (
        <Button
          variant="secondary"
          onPress={() => {
            setChallenge('');
            setCode('');
            setFactorRequired(false);
          }}
        >
          Request a new code
        </Button>
      ) : (
        <Button variant="ghost" onPress={() => setMode('reset')}>
          Forgot password?
        </Button>
      )}
    </Page>
  );
}
