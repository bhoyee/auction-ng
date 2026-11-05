import { useEffect, useRef, useState } from 'react';
import { View, Pressable, Keyboard } from 'react-native';
import * as Crypto from 'expo-crypto';
import { createWithdrawalClient } from '@auction-ng/api-client/withdrawals';
import {
  createPaymentClient,
  createWalletClient,
} from '@auction-ng/api-client';
import {
  formatNaira,
  canCancelWithdrawal,
  type WithdrawalStartInput,
  type WithdrawalConfirmInput,
} from '@auction-ng/shared';
import { parseNairaInput } from '@auction-ng/ui/presentation';
import { Page, Private, Notice, Pagination } from '../components/ui/page';
import { Body, Button, Input, Dialog } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import {
  WalletReview,
  walletReviewStyles as wr,
} from '../components/ui/wallet-review';
import { Password, CodeInput } from './auth';
import { apiUrl } from '../lib/config';
import { useSession } from '../lib/session';
import { useLiveRead } from '../lib/live-read';
import { WithdrawalStatusBadge } from '../components/ui/withdrawal-status-badge';
import { withdrawalConfirmationFeedback } from '../lib/withdrawal-presentation';
import {
  withdrawalAttempt,
  withdrawalStartError,
  withdrawalConfirmationError,
} from '../lib/withdrawal-attempt';
export default function WithdrawScreen() {
  const { manager, session, online } = useSession();
  const [amount, setAmount] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [factor, setFactor] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [messageTone, setMessageTone] = useState<'success' | 'warning' | 'error'>(
      'success',
    ),
    [feedbackVersion, setFeedbackVersion] = useState(0),
    [submittedId, setSubmittedId] = useState<string>(),
    [busy, setBusy] = useState(false),
    [quote, setQuote] = useState<{
      amountKobo: number;
      feeKobo: number;
      levyKobo: number;
      totalKobo: number;
    }>(),
    [draft, setDraft] = useState<string>(),
    [bankOpen, setBankOpen] = useState(false),
    [reviewOpen, setReviewOpen] = useState(false),
    [bankCode, setBankCode] = useState(''),
    [query, setQuery] = useState(''),
    [account, setAccount] = useState(''),
    [bvn, setBvn] = useState(''),
    [firstName, setFirstName] = useState(''),
    [lastName, setLastName] = useState(''),
    [bankConsent, setBankConsent] = useState(false),
    [cursor, setCursor] = useState<string>(),
    [pages, setPages] = useState<(string | undefined)[]>([]),
    [bankChangeId, setBankChangeId] = useState<string>();
  const request = useRef<WithdrawalStartInput | undefined>(undefined);
  const confirmRequest = useRef<WithdrawalConfirmInput | undefined>(undefined);
  const bankChangeKey = useRef(Crypto.randomUUID());
  function showError(message: string) {
    Keyboard.dismiss();
    setError(message);
  }
  const overview = useLiveRead(
    () => manager.run((c) => createWithdrawalClient(apiUrl, c).overview()),
    [session?.user.id],
    5000,
  );
  const balance = useLiveRead(
    () => manager.run((c) => createWalletClient(apiUrl, c).getBalance()),
    [session?.user.id],
    5000,
  );
  const history = useLiveRead(
    () =>
      manager.run((c) =>
        createWithdrawalClient(apiUrl, c).history({ limit: 10, cursor }),
      ),
    [cursor, session?.user.id],
    5000,
  );
  const submitted = useLiveRead(
    () =>
      manager.run((c) =>
        createWithdrawalClient(apiUrl, c).get(submittedId ?? ''),
      ),
    [submittedId, session?.user.id],
    5000,
    !!submittedId,
  );
  useEffect(() => {
    const result = submitted.data;
    if (
      !submittedId ||
      result?.id !== submittedId ||
      !['success', 'failed', 'reversed', 'rejected', 'cancelled'].includes(
        result.status,
      )
    )
      return;
    const feedback = withdrawalConfirmationFeedback(result.status);
    setMessage(feedback.message);
    setMessageTone(feedback.tone);
    if (result.status === 'success') setAmount('');
    Keyboard.dismiss();
    setFeedbackVersion((value) => value + 1);
    setSubmittedId(undefined);
    history.refresh();
    balance.refresh();
  }, [submitted.data, submittedId, history.refresh, balance.refresh]);
  const banks = useLiveRead(
    async () => {
      if (!bankOpen) return [];
      return manager.run(async (c) => {
        const api = createPaymentClient(apiUrl, c);
        let next: string | undefined;
        const all: { name: string; code: string }[] = [];
        for (let page = 0; page < 50; page++) {
          const batch = await api.getBanks({ limit: 50, cursor: next });
          all.push(...batch.items);
          if (!batch.nextCursor)
            return [...new Map(all.map((bank) => [bank.code, bank])).values()];
          next = batch.nextCursor;
        }
        throw Error('Bank directory exceeded safe size.');
      });
    },
    [bankOpen],
    60000,
  );
  async function fees() {
    const value = parseNairaInput(amount);
    if (!value) return;
    setError('');
    setBusy(true);
    try {
      const next = await manager.run((c) =>
        createWithdrawalClient(apiUrl, c).quote(value),
      );
      const fresh = await manager.run((c) =>
        createWalletClient(apiUrl, c).getBalance(),
      );
      if (fresh.availableKobo < next.totalKobo)
        throw Error(
          'Insufficient available funds to cover this withdrawal and its fees.',
        );
      setQuote(next);
      setReviewOpen(true);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.startsWith('Insufficient')
          ? cause.message
          : 'Could not check withdrawal fees. Retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!quote || !overview.data?.bank) return;
    setBusy(true);
    setError('');
    try {
      request.current = withdrawalAttempt(request.current, {
        bankId: overview.data.bank.id,
        amountKobo: quote.amountKobo,
        acceptedTotalKobo: quote.totalKobo,
        password,
        idempotencyKey: request.current?.idempotencyKey ?? Crypto.randomUUID(),
      });
      const result = await manager.run((c) =>
        createWithdrawalClient(apiUrl, c).start(
          request.current as WithdrawalStartInput,
        ),
      );
      setDraft(result.id);
      setPassword('');
      request.current = undefined;
    } catch (failure: unknown) {
      showError(withdrawalStartError(failure));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!draft && !bankChangeId) return;
    setBusy(true);
    setError('');
    try {
      confirmRequest.current ??= {
        id: bankChangeId ?? draft ?? '',
        code,
        factor: session?.user.twoFactorEnabled
          ? { method: 'authenticator', code: factor }
          : undefined,
      };
      if (bankChangeId) {
        await manager.run((c) =>
          createWithdrawalClient(apiUrl, c).confirmBankChange(
            confirmRequest.current as WithdrawalConfirmInput,
          ),
        );
        setMessage('Bank account updated.');
        setMessageTone('success');
        setBankChangeId(undefined);
        setBankOpen(false);
      } else {
        const result = await manager.run((c) =>
          createWithdrawalClient(apiUrl, c).confirm(
            confirmRequest.current as WithdrawalConfirmInput,
          ),
        );
        const feedback = withdrawalConfirmationFeedback(result.status);
        setMessage(feedback.message);
        setMessageTone(feedback.tone);
        if (feedback.clearAmount) setAmount('');
        if (feedback.clearAmount && result.status !== 'success')
          setSubmittedId(result.id);
        setDraft(undefined);
        setReviewOpen(false);
        setQuote(undefined);
      }
      Keyboard.dismiss();
      setFeedbackVersion((value) => value + 1);
      setCode('');
      setFactor('');
      confirmRequest.current = undefined;
      history.refresh();
      overview.refresh();
      balance.refresh();
    } catch (failure: unknown) {
      showError(withdrawalConfirmationError(failure));
      confirmRequest.current = undefined;
    } finally {
      setBusy(false);
    }
  }
  async function saveBank() {
    setBusy(true);
    setError('');
    try {
      if (overview.data?.bank) {
        const result = await manager.run((c) =>
          createWithdrawalClient(apiUrl, c).startBankChange({
            bankCode,
            accountNumber: account,
            password,
            consent: true,
            idempotencyKey: bankChangeKey.current,
          }),
        );
        setBankChangeId(result.id);
        setPassword('');
      } else {
        await manager.run((c) =>
          createWithdrawalClient(apiUrl, c).verifyBank({
            bankCode,
            accountNumber: account,
            bvn,
            firstName,
            lastName,
            consent: true,
          }),
        );
        setBankOpen(false);
        setBvn('');
        setAccount('');
        overview.refresh();
      }
    } catch {
      showError(
        'Bank verification could not be completed. Check the details and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Withdraw funds" scrollToTopKey={feedbackVersion}>
      <Private>
        <Notice
          message={error || overview.error}
          onClose={() => {
            setError('');
            overview.refresh();
          }}
        />
        <Notice
          message={message}
          tone={messageTone}
          onClose={() => setMessage('')}
        />
        <View style={n.surface}>
          <Body tone="section">
            Available{' '}
            {balance.data
              ? formatNaira(balance.data.availableKobo)
              : 'Checking'}
          </Body>
          <Body tone="secondary">
            Eligible for automatic withdrawal:{' '}
            {overview.data
              ? formatNaira(overview.data.automaticAvailableKobo)
              : 'Checking'}
            . Other available funds require review.
          </Body>
          <Body tone="fine">
            Minimum {formatNaira(overview.data?.minimumKobo ?? 0)} - daily limit{' '}
            {formatNaira(overview.data?.dailyLimitKobo ?? 0)}
          </Body>
          {overview.data?.bank ? (
            <>
              <Body style={n.bold}>
                {overview.data.bank.accountName} - {overview.data.bank.bankName}{' '}
                - {overview.data.bank.accountLast4}
              </Body>
              <Button
                size="small"
                disabled={busy || !!draft || !!request.current}
                onPress={() => {
                  setBankOpen(true);
                  setCode('');
                }}
              >
                Change account
              </Button>
            </>
          ) : (
            <Button onPress={() => setBankOpen(true)}>
              Verify your bank account
            </Button>
          )}
          <Input
            label="Amount your bank receives (NGN)"
            prefix="₦"
            keyboardType="decimal-pad"
            value={amount}
            editable={!request.current && !draft}
            onChangeText={(text) => {
              setAmount(text.replace(/[^0-9.]/g, ''));
              setQuote(undefined);
            }}
          />
          <Button
            busy={busy}
            disabled={
              !online ||
              !overview.data?.enabled ||
              !overview.data.bank ||
              !!request.current ||
              !!draft
            }
            onPress={() => void fees()}
          >
            Show withdrawal fee
          </Button>
          {(draft || request.current) && (
            <Button onPress={() => setReviewOpen(true)}>
              Resume withdrawal confirmation
            </Button>
          )}
        </View>
        <Body tone="section">Withdrawal history</Body>
        {history.data?.items.map((item) => (
          <View key={item.id} style={n.surface}>
            <View style={n.between}>
              <Body style={n.bold}>{formatNaira(item.amountKobo)}</Body>
              <WithdrawalStatusBadge
                status={item.status}
                providerIssue={item.processingIssue === 'provider_account'}
              />
            </View>
            <Body tone="fine">
              {new Date(item.createdAt).toLocaleString('en-NG', {
                timeZone: 'Africa/Lagos',
              })}{' '}
              WAT
            </Body>
            {canCancelWithdrawal(item.status) && (
              <Button
                size="small"
                variant="danger"
                onPress={() =>
                  void manager
                    .run((c) =>
                      createWithdrawalClient(apiUrl, c).cancel(item.id),
                    )
                    .then(() => {
                      history.refresh();
                      balance.refresh();
                    })
                    .catch(() =>
                      setError('Could not cancel. Refresh status and retry.'),
                    )
                }
              >
                Cancel withdrawal
              </Button>
            )}
          </View>
        ))}
        <Pagination
          previous={
            pages.length
              ? () => {
                  setCursor(pages.at(-1));
                  setPages((p) => p.slice(0, -1));
                }
              : undefined
          }
          next={
            history.data?.nextCursor
              ? () => {
                  setPages((p) => [...p, cursor]);
                  setCursor(history.data?.nextCursor ?? undefined);
                }
              : undefined
          }
        />
        <Dialog
          open={reviewOpen}
          title={draft ? 'Verify withdrawal' : 'Review withdrawal'}
          headerAccessory={
            <Notice message={error} onClose={() => setError('')} />
          }
          presentation="sheet"
          expanded
          onClose={() => {
            if (!busy) {
              setReviewOpen(false);
              if (!request.current) setPassword('');
              setCode('');
              setFactor('');
            }
          }}
          footer={
            <View style={wr.footer}>
              <Button
                fullWidth
                busy={busy}
                disabled={!online || (!draft && !password)}
                onPress={() => void (draft ? confirm() : start())}
              >
                {draft
                  ? 'Confirm withdrawal'
                  : request.current
                    ? 'Retry same withdrawal'
                    : 'Continue to email confirmation'}
              </Button>
            </View>
          }
        >
          <View style={wr.content}>
            {overview.data?.bank && (
              <View style={wr.bank}>
                <Body tone="fine">Receiving bank account</Body>
                <Body style={n.bold}>{overview.data.bank.accountName}</Body>
                <Body tone="secondary">
                  {overview.data.bank.bankName} - Account ending{' '}
                  <Body tone="secondary" style={n.bold}>
                    {overview.data.bank.accountLast4}
                  </Body>
                </Body>
              </View>
            )}
            {quote && (
              <WalletReview
                rows={[
                  { label: 'Your bank receives', amountKobo: quote.amountKobo },
                  { label: 'Transfer fee', amountKobo: quote.feeKobo },
                  { label: 'Levy', amountKobo: quote.levyKobo },
                ]}
                totalLabel="Total wallet debit"
                totalKobo={quote.totalKobo}
              />
            )}
            {draft ? (
              <>
                <Body tone="secondary">
                  Enter the code sent to your verified email to confirm this
                  withdrawal.
                </Body>
                <CodeInput value={code} onChange={setCode} />
                {session?.user.twoFactorEnabled && (
                  <Input
                    label="Authenticator code"
                    style={n.verificationInput}
                    value={factor}
                    onChangeText={setFactor}
                    keyboardType="number-pad"
                  />
                )}
              </>
            ) : (
              <>
                <Body tone="fine">
                  Review the receiving account and fees, then confirm with your
                  password. Email verification follows.
                </Body>
                <Password
                  label="Confirm password"
                  value={password}
                  onChange={(value) => {
                    if (!busy) setPassword(value);
                  }}
                />
              </>
            )}
          </View>
        </Dialog>
        <Dialog
          open={bankOpen}
          headerAccessory={
            <Notice
              message={error || banks.error}
              onClose={() => setError('')}
            />
          }
          title={
            overview.data?.bank
              ? 'Change verified bank'
              : 'Verify withdrawal account'
          }
          onClose={() => {
            if (!busy) {
              setBankOpen(false);
              setBvn('');
              setAccount('');
              setPassword('');
            }
          }}
          presentation="sheet"
        >
          <View style={n.content}>
            {bankChangeId ? (
              <>
                <CodeInput value={code} onChange={setCode} />
                {session?.user.twoFactorEnabled && (
                  <Input
                    label="Authenticator code"
                    style={n.verificationInput}
                    value={factor}
                    onChangeText={setFactor}
                  />
                )}
                <Button busy={busy} onPress={() => void confirm()}>
                  Confirm bank change
                </Button>
              </>
            ) : (
              <>
                <Input
                  label="Search banks"
                  value={query}
                  onChangeText={setQuery}
                />
                {banks.data
                  ?.filter((bank) =>
                    bank.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .slice(0, 12)
                  .map((bank) => (
                    <Pressable
                      key={bank.code}
                      style={[n.link, bankCode === bank.code && n.shade]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: bankCode === bank.code }}
                      onPress={() => {
                        setBankCode(bank.code);
                        setQuery(bank.name);
                      }}
                    >
                      <Body>{bank.name}</Body>
                    </Pressable>
                  ))}
                <Input
                  label="Account number"
                  value={account}
                  onChangeText={(text) =>
                    setAccount(text.replace(/\D/g, '').slice(0, 10))
                  }
                  keyboardType="number-pad"
                />
                {overview.data?.bank ? (
                  <Password
                    label="Current password"
                    value={password}
                    onChange={setPassword}
                  />
                ) : (
                  <>
                    <Input
                      label="First name"
                      value={firstName}
                      onChangeText={setFirstName}
                    />
                    <Input
                      label="Last name"
                      value={lastName}
                      onChangeText={setLastName}
                    />
                    <Input
                      label="BVN"
                      value={bvn}
                      onChangeText={(text) =>
                        setBvn(text.replace(/\D/g, '').slice(0, 11))
                      }
                      secureTextEntry
                      keyboardType="number-pad"
                    />
                  </>
                )}
                <Button
                  variant={bankConsent ? 'primary' : 'secondary'}
                  onPress={() => setBankConsent((v) => !v)}
                >
                  {bankConsent
                    ? 'Verification consent accepted'
                    : 'I consent to own-account verification'}
                </Button>
                <Button
                  busy={busy}
                  disabled={!bankConsent || !bankCode || account.length !== 10}
                  onPress={() => void saveBank()}
                >
                  {overview.data?.bank
                    ? 'Continue to confirmation'
                    : 'Verify account'}
                </Button>
              </>
            )}
          </View>
        </Dialog>
      </Private>
    </Page>
  );
}
