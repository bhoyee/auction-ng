import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { mobileTheme as t } from '@auction-ng/ui';
import { formatNaira } from '@auction-ng/shared/money';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { useSession } from '../../lib/session';
import { useBuyerActivity } from '../../lib/buyer-activity';
import { apiUrl } from '../../lib/config';
import {
  celebratedKey,
  celebrationCandidates,
  readCelebrated,
  rememberCelebrated,
} from '../../lib/win-celebration';
import { BalloonArt, CelebrationTrophyArt } from '../illustrations/deal-art';
import { art, celebrationColours } from '../illustrations/palette';
import { photoUrl } from '../../screens/catalogue';

export type Win = {
  invoiceId: string;
  paid: boolean;
  totalKobo: number;
  title: string;
  photo?: string;
  more: number;
};

/** Stable pseudo-random spread so the layout looks natural but never jumps. */
const spread = (index: number, salt: number) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Celebrates a new auction win once, when the app opens (owner request,
 * 2026-11-20). Reads the buyer's latest invoices; never changes money.
 */
export function WinCelebration() {
  const { session, manager } = useSession();
  const router = useRouter();
  const [win, setWin] = useState<Win>();
  const checking = useRef(false);
  const userId = session?.user.id;

  const check = useCallback(async () => {
    if (!userId || checking.current) return;
    checking.current = true;
    try {
      const key = celebratedKey(userId);
      const stored = readCelebrated(await AsyncStorage.getItem(key));
      const page = await manager.run((c) =>
        createBuyerClient(apiUrl, c).invoices({ limit: 10 }),
      );
      const fresh = celebrationCandidates(
        page.items,
        new Set(stored.ids),
        Date.now(),
        stored.firstRun,
      );
      const newest = fresh[0];
      // Remember them now: a celebration never repeats, even if dismissed
      // by closing the app.
      await AsyncStorage.setItem(
        key,
        JSON.stringify(
          rememberCelebrated(
            stored.ids,
            fresh.map((invoice) => invoice.id),
          ),
        ),
      );
      if (!newest) return;
      const detail = await manager
        .run((c) => createBuyerClient(apiUrl, c).invoice(newest.id))
        .catch(() => undefined);
      const lot = detail?.lines[0]?.lot;
      setWin({
        invoiceId: newest.id,
        paid: newest.status === 'paid',
        totalKobo: newest.totalKobo,
        title: lot?.title ?? 'your item',
        photo: photoUrl(lot?.thumbnailUrl),
        more: fresh.length - 1,
      });
    } catch {
      // A celebration is a bonus: never show an error for it.
    } finally {
      checking.current = false;
    }
  }, [userId, manager]);

  // When the app opens or returns to the foreground...
  useEffect(() => {
    void check();
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void check();
    });
    return () => listener.remove();
  }, [check]);
  // ...and while it is open: a settled win adds a result notice and an item
  // awaiting pickup, which the activity poll (every 5 s) picks up, so the
  // celebration appears within seconds on whatever screen the buyer is on.
  const { counts } = useBuyerActivity();
  useEffect(() => {
    if (counts) void check();
  }, [counts?.unread, counts?.awaitingPickup, check]);

  if (!win) return null;
  return (
    <CelebrationOverlay
      win={win}
      onClose={() => setWin(undefined)}
      onAction={() => {
        setWin(undefined);
        router.push(`/invoices/${win.invoiceId}`);
      }}
    />
  );
}

export function CelebrationOverlay({
  win,
  onClose,
  onAction,
}: {
  win: Win;
  onClose: () => void;
  onAction: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const card = useRef(new Animated.Value(0)).current;
  const balloons = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => ({
        rise: new Animated.Value(0),
        sway: new Animated.Value(0),
        left: spread(index, 1) * (width - 60),
        size: 38 + spread(index, 2) * 26,
        colour:
          celebrationColours[index % celebrationColours.length] ?? art.gold,
        duration: 5200 + spread(index, 3) * 2600,
        delay: spread(index, 4) * 900,
      })),
    [width],
  );
  const confetti = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        fall: new Animated.Value(0),
        left: spread(index, 5) * width,
        size: 6 + spread(index, 6) * 6,
        colour:
          celebrationColours[index % celebrationColours.length] ?? art.gold,
        duration: 2600 + spread(index, 7) * 2200,
        delay: spread(index, 8) * 1200,
        turns: 1 + Math.round(spread(index, 9) * 3),
      })),
    [width],
  );

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => active && setReducedMotion(value))
      .catch(() => active && setReducedMotion(true));
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reducedMotion === null) return;
    if (reducedMotion) {
      card.setValue(1);
      return;
    }
    Animated.spring(card, {
      toValue: 1,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
    const animations = [
      ...balloons.map((b) =>
        Animated.parallel([
          Animated.timing(b.rise, {
            toValue: 1,
            duration: b.duration,
            delay: b.delay,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.loop(
            Animated.sequence([
              Animated.timing(b.sway, {
                toValue: 1,
                duration: 1400,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(b.sway, {
                toValue: 0,
                duration: 1400,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ]),
            { iterations: 4 },
          ),
        ]),
      ),
      ...confetti.map((c) =>
        Animated.timing(c.fall, {
          toValue: 1,
          duration: c.duration,
          delay: c.delay,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ];
    const all = Animated.parallel(animations);
    all.start();
    return () => all.stop();
  }, [reducedMotion, balloons, confetti, card]);

  const still = reducedMotion === true;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.backdrop} accessibilityViewIsModal>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {balloons.map((b, index) => (
            <Animated.View
              key={`balloon-${index}`}
              style={[
                s.float,
                {
                  left: b.left,
                  top: still ? height - 120 - spread(index, 10) * 160 : height,
                  transform: still
                    ? []
                    : [
                        {
                          translateY: b.rise.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -(height + 260)],
                          }),
                        },
                        {
                          translateX: b.sway.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-10, 10],
                          }),
                        },
                      ],
                },
              ]}
            >
              <BalloonArt colour={b.colour} width={b.size} />
            </Animated.View>
          ))}
          {!still &&
            confetti.map((c, index) => (
              <Animated.View
                key={`confetti-${index}`}
                style={[
                  s.confetti,
                  {
                    left: c.left,
                    width: c.size,
                    height: c.size * 1.6,
                    backgroundColor: c.colour,
                    transform: [
                      {
                        translateY: c.fall.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-40, height + 40],
                        }),
                      },
                      {
                        rotate: c.fall.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', `${c.turns * 360}deg`],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
        </View>
        <Animated.View
          style={[
            s.card,
            {
              opacity: card,
              transform: [
                {
                  scale: card.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.86, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={s.trophy}>
            <CelebrationTrophyArt size={92} />
          </View>
          <Text style={s.eyebrow} accessibilityRole="header">
            Congratulations!
          </Text>
          <Text style={s.title}>You won</Text>
          {win.photo && (
            <Image
              source={win.photo}
              style={s.photo}
              contentFit="cover"
              accessibilityLabel={win.title}
            />
          )}
          <Text style={s.item} numberOfLines={2}>
            {win.title}
          </Text>
          {win.paid ? (
            <Text style={s.total}>
              {`Paid ${formatNaira(win.totalKobo)} from your wallet`}
            </Text>
          ) : (
            // Rare: the held funds did not cover the final total, so the
            // server marked it payment due with 24 hours to pay.
            <Text style={s.due}>
              {`Your wallet didn't cover the final total of ${formatNaira(win.totalKobo)}. Pay within 24 hours to keep this item.`}
            </Text>
          )}
          {win.more > 0 && (
            <Text style={s.more}>
              {`You also won ${win.more} more ${win.more === 1 ? 'item' : 'items'}.`}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={({ pressed }) => [s.primary, pressed && s.pressed]}
          >
            <Text style={s.primaryText}>
              {win.paid ? 'View pickup details' : 'Complete payment'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [s.secondary, pressed && s.pressed]}
          >
            <Text style={s.secondaryText}>Keep browsing</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 64, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: t.spacing.xl,
  },
  float: { position: 'absolute' },
  confetti: { position: 'absolute', top: 0, borderRadius: 2 },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.promotion / 1.4,
    paddingHorizontal: t.spacing.xl,
    paddingBottom: t.spacing.xl,
    paddingTop: 56,
    alignItems: 'center',
    gap: t.spacing.sm,
    shadowColor: t.colors.ink,
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 24,
  },
  trophy: {
    position: 'absolute',
    top: -52,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: t.colors['indigo-50'],
    borderWidth: 6,
    borderColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: t.fontFamily,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    color: t.colors['indigo-900'],
    textAlign: 'center',
  },
  title: {
    fontFamily: t.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: t.colors['slate-600'],
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.canvas,
  },
  item: {
    fontFamily: t.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: t.colors.ink,
    textAlign: 'center',
  },
  total: {
    fontFamily: t.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: t.colors['win-600'],
    fontVariant: ['tabular-nums'],
  },
  due: {
    fontFamily: t.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: t.colors['outbid-600'],
    textAlign: 'center',
  },
  more: {
    fontFamily: t.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: t.colors['slate-600'],
  },
  primary: {
    alignSelf: 'stretch',
    minHeight: t.layout.touch + 6,
    marginTop: t.spacing.sm,
    borderRadius: t.radius.card,
    backgroundColor: t.colors['indigo-900'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontFamily: t.fontFamily,
    fontSize: 16,
    fontWeight: '800',
    color: t.colors.surface,
  },
  secondary: {
    alignSelf: 'stretch',
    minHeight: t.layout.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: t.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: t.colors['indigo-900'],
  },
  pressed: { opacity: 0.75 },
});
