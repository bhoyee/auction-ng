import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import {
  ArrowRight,
  Gavel,
  Pause,
  Play,
  ShoppingBag,
  Wallet,
} from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { Body } from './controls';
import { h } from './home-styles';
import { heroStyles as s } from './home-hero-styles';
import phonePhoto from '../../assets/home-phone.webp';

export function HomeHero({ onStart }: { onStart: () => void }) {
  const rail = useRef<ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const wide = width >= 700;
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    const app = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => {
      mounted = false;
      motion.remove();
      app.remove();
    };
  }, []);
  useEffect(() => {
    rail.current?.scrollTo({ x: width * index, animated: false });
  }, [width, index]);
  useEffect(() => {
    if (!width || paused || reduceMotion || !active || !focused) return;
    const timer = setTimeout(() => {
      rail.current?.scrollTo({ x: width * (1 - index), animated: true });
    }, 6500);
    return () => clearTimeout(timer);
  }, [width, index, paused, reduceMotion, active, focused]);
  return (
    <View
      style={s.frame}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={rail}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onTouchStart={() => setPaused(true)}
        onMomentumScrollEnd={(event) => {
          if (width)
            setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
      >
        <View
          style={[h.hero, s.slide, { width }, wide && h.heroWide]}
          accessibilityElementsHidden={index !== 0}
          importantForAccessibility={
            index === 0 ? 'auto' : 'no-hide-descendants'
          }
        >
          <View style={[h.heroCopy, wide && h.heroCopyWide]}>
            <Body style={h.heroKicker}>Bid. Win. Save.</Body>
            <Body style={[h.heroTitle, wide && h.heroTitleWide]}>
              Great finds.{'\n'}Your price.
            </Body>
            <Pressable
              accessibilityRole="button"
              onPress={onStart}
              style={({ pressed }) => [h.heroButton, pressed && h.pressed]}
            >
              <Body style={h.heroButtonText}>Start bidding</Body>
              <ArrowRight size={17} color={t.colors.ink} />
            </Pressable>
          </View>
          <Image
            source={phonePhoto}
            style={[h.heroPhoto, wide && h.heroPhotoWide]}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel="Representative smartphone promotional photograph"
          />
        </View>
        <View
          style={[s.guideSlide, { width }, wide && h.heroWide]}
          accessibilityElementsHidden={index !== 1}
          importantForAccessibility={
            index === 1 ? 'auto' : 'no-hide-descendants'
          }
        >
          <Body style={h.heroKicker}>Top up. Bid. Collect.</Body>
          <Body style={[h.heroTitle, wide && h.heroTitleWide]}>
            Your first win{'\n'}starts here.
          </Body>
          <View style={s.steps}>
            {[
              { icon: Wallet, label: 'Top up' },
              { icon: Gavel, label: 'Bid & win' },
              { icon: ShoppingBag, label: 'Collect' },
            ].map((step) => (
              <View key={step.label} style={s.step}>
                <step.icon size={20} color={t.colors['danfo-400']} />
                <Body style={s.stepLabel}>{step.label}</Body>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onStart}
            style={({ pressed }) => [h.heroButton, pressed && h.pressed]}
          >
            <Body style={h.heroButtonText}>Join now</Body>
            <ArrowRight size={17} color={t.colors.ink} />
          </Pressable>
        </View>
      </ScrollView>
      <View style={s.controls}>
        <Body style={s.caption}>
          {index === 0 ? 'Find your next deal' : 'Three steps to get started'}
        </Body>
        {[0, 1].map((slide) => (
          <Pressable
            key={slide}
            accessibilityRole="button"
            accessibilityLabel={`Show banner ${slide + 1} of 2`}
            accessibilityState={{ selected: index === slide }}
            onPress={() => {
              setPaused(true);
              setIndex(slide);
            }}
            style={s.control}
          >
            <View style={[s.dot, index === slide && s.selectedDot]} />
          </Pressable>
        ))}
        {!reduceMotion && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume banners' : 'Pause banners'}
            onPress={() => setPaused(!paused)}
            style={s.control}
          >
            {paused ? (
              <Play size={16} color={t.colors.surface} />
            ) : (
              <Pause size={16} color={t.colors.surface} />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
