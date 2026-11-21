import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { Href } from 'expo-router';
import {
  BadgeCheck,
  ChevronRight,
  Lock,
  MailWarning,
  PackageCheck,
  QrCode,
  Wallet,
} from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { formatNaira } from '@auction-ng/shared/money';
import { createWalletClient } from '@auction-ng/api-client';
import { ApiError } from '@auction-ng/api-client/auth';
import { useSession } from '../../lib/session';
import { useLiveRead } from '../../lib/live-read';
import { useBuyerActivity } from '../../lib/buyer-activity';
import { apiUrl } from '../../lib/config';
import { amountFontSize, firstName, initials } from '../../lib/amount-fit';
import { art, cardAccents } from '../illustrations/palette';
import { BalanceCardArt } from '../illustrations/balance-card-art';

/**
 * Top of the signed-in Account screen (owner request, 2026-11-20): greeting
 * with a verified tick, Check-in, available and reserved wallet balances,
 * and items awaiting pickup.
 */
export function AccountSummary({
  onNavigate,
}: {
  onNavigate: (href: Href) => void;
}) {
  const { manager, session } = useSession();
  const { counts } = useBuyerActivity();
  const { fontScale, width } = useWindowDimensions();
  const wallet = useLiveRead(
    () =>
      manager.run(async (c) => {
        try {
          return await createWalletClient(apiUrl, c).getBalance();
        } catch (error: unknown) {
          if (error instanceof ApiError && error.status === 404)
            return { availableKobo: 0, heldKobo: 0 };
          throw error;
        }
      }),
    [session?.user.id],
    15000,
  );
  const verified = !!session?.user.emailVerified;
  // Very large text or narrow screens stack the cards instead of squeezing.
  const stacked = fontScale > 1.3 || width < 340;
  const pickup = counts?.awaitingPickup ?? 0;
  const amount = (kobo: number | undefined) =>
    wallet.error && kobo === undefined
      ? 'Tap to retry'
      : kobo === undefined
        ? '—'
        : formatNaira(kobo);
  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <View
          style={s.avatar}
          accessible
          accessibilityLabel={
            verified ? 'Your account, email verified' : 'Your account'
          }
        >
          <Text style={s.avatarText} maxFontSizeMultiplier={1.2}>
            {initials(session?.user.name)}
          </Text>
          {verified && (
            <View style={s.tick}>
              <BadgeCheck
                size={20}
                color={t.colors.surface}
                fill={t.colors['win-600']}
                strokeWidth={2.5}
              />
            </View>
          )}
        </View>
        <View style={s.hello}>
          <Text style={s.helloText} numberOfLines={1}>
            {`Hi, ${firstName(session?.user.name)}!`}
          </Text>
          {!verified && (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens profile and security to verify your email"
              onPress={() => onNavigate('/profile')}
              style={({ pressed }) => [s.verify, pressed && s.pressed]}
            >
              <MailWarning size={14} color={t.colors.ink} />
              <Text style={s.verifyText}>Verify email to bid</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Check-in"
          accessibilityHint="Opens your pickup check-in"
          onPress={() => onNavigate('/check-in')}
          style={({ pressed }) => [s.checkIn, pressed && s.pressed]}
        >
          <QrCode size={18} color={t.colors.ink} />
          <Text style={s.checkInText} maxFontSizeMultiplier={1.2}>
            Check-in
          </Text>
        </Pressable>
      </View>

      <View style={[s.cards, stacked && s.cardsStacked]}>
        <BalanceCard
          tone="balance"
          icon={Wallet}
          label="Balance"
          value={amount(wallet.data?.availableKobo)}
          detail="Ready to bid or withdraw"
          onPress={() =>
            wallet.error ? wallet.refresh() : onNavigate('/wallet')
          }
        />
        <BalanceCard
          tone="reserved"
          icon={Lock}
          label="Reserved"
          value={amount(wallet.data?.heldKobo)}
          detail="Held for your active bids"
          onPress={() =>
            wallet.error ? wallet.refresh() : onNavigate('/wallet')
          }
        />
      </View>

      {pickup > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Awaiting pickup: ${pickup} ${pickup === 1 ? 'item' : 'items'} ready`}
          accessibilityHint="Opens items awaiting pickup"
          onPress={() => onNavigate('/orders')}
          style={({ pressed }) => [s.pickup, pressed && s.pressed]}
        >
          <View style={s.pickupIcon}>
            <PackageCheck size={24} color={t.colors.surface} />
          </View>
          <View style={s.grow}>
            <Text style={s.pickupTitle}>Awaiting pickup</Text>
            <Text style={s.pickupDetail}>
              {`${pickup} ${pickup === 1 ? 'item' : 'items'} ready to collect`}
            </Text>
          </View>
          <View style={s.pickupCount}>
            <Text style={s.pickupCountText}>
              {pickup > 99 ? '99+' : pickup}
            </Text>
          </View>
          <ChevronRight size={20} color={t.colors.surface} />
        </Pressable>
      )}
    </View>
  );
}

function BalanceCard({
  tone,
  icon: Icon,
  label,
  value,
  detail,
  onPress,
}: {
  tone: 'balance' | 'reserved';
  icon: typeof Wallet;
  label: string;
  value: string;
  detail: string;
  onPress: () => void;
}) {
  const [width, setWidth] = useState(0);
  const primary = tone === 'balance';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        primary ? s.cardPrimary : s.cardReserved,
        pressed && s.pressed,
      ]}
    >
      <BalanceCardArt tone={tone} />
      <View style={[s.cardIcon, primary ? s.cardIconPrimary : s.cardIconSoft]}>
        <Icon size={18} color={primary ? cardAccents.gold : art.gold} />
      </View>
      <Text
        style={[s.cardLabel, primary ? s.onDark : s.onGold]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <Text
          style={[
            s.cardValue,
            primary ? s.onDark : s.onGold,
            { fontSize: amountFontSize(value, width) },
            { lineHeight: amountFontSize(value, width) * 1.25 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1}
        >
          {value}
        </Text>
      </View>
      <Text
        style={[s.cardDetail, primary ? s.onDarkSoft : s.onGoldSoft]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
      >
        {detail}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { gap: t.spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors['indigo-900'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: t.fontFamily,
    fontSize: 20,
    fontWeight: '700',
    color: t.colors.surface,
  },
  tick: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    borderRadius: 12,
    backgroundColor: t.colors.surface,
    padding: 1,
  },
  hello: { flex: 1, minWidth: 0, gap: 4 },
  helloText: {
    fontFamily: t.fontFamily,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: t.colors.ink,
  },
  verify: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: t.spacing.sm,
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: t.colors['danfo-400'],
  },
  verifyText: {
    fontFamily: t.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: t.colors.ink,
  },
  checkIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: t.layout.touch,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.layout.touch / 2,
    backgroundColor: t.colors['danfo-400'],
  },
  checkInText: {
    fontFamily: t.fontFamily,
    fontSize: 14,
    fontWeight: '600',
    color: t.colors.ink,
  },
  cards: { flexDirection: 'row', gap: t.spacing.md },
  cardsStacked: { flexDirection: 'column' },
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    padding: t.spacing.lg,
    gap: 4,
    overflow: 'hidden',
  },
  cardPrimary: {
    backgroundColor: t.colors['indigo-900'],
    shadowColor: t.colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  cardReserved: {
    backgroundColor: t.colors['danfo-400'],
    shadowColor: t.colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardIconPrimary: { backgroundColor: 'rgba(255,255,255,0.14)' },
  cardIconSoft: { backgroundColor: t.colors['indigo-900'] },
  cardLabel: {
    fontFamily: t.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: t.colors['slate-600'],
  },
  cardValue: {
    fontFamily: t.fontFamily,
    fontWeight: '600',
    color: t.colors['indigo-900'],
    fontVariant: ['tabular-nums'],
  },
  cardDetail: {
    fontFamily: t.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: t.colors['slate-600'],
  },
  onDark: { color: t.colors.surface },
  onDarkSoft: { color: t.colors['indigo-50'] },
  onGold: { color: t.colors.ink },
  onGoldSoft: { color: t.colors.ink, opacity: 0.75 },
  pickup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    padding: t.spacing.lg,
    borderRadius: 20,
    backgroundColor: t.colors['win-600'],
  },
  pickupIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, minWidth: 0 },
  pickupTitle: {
    fontFamily: t.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: t.colors.surface,
  },
  pickupDetail: {
    fontFamily: t.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: t.colors.surface,
    opacity: 0.9,
  },
  pickupCount: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupCountText: {
    fontFamily: t.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: t.colors.surface,
    fontVariant: ['tabular-nums'],
  },
  pressed: { opacity: 0.85 },
});
