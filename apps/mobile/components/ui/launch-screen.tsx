import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Text,
  View,
} from 'react-native';
import { Gavel } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { mobileTheme as t } from '@auction-ng/ui';
import { launchStyles as s } from './launch-styles';
import wordmark from '../../assets/launch-wordmark.png';
import tagline from '../../assets/launch-tagline.png';

export function LaunchScreen({
  error,
  ready = false,
  onFinished,
}: {
  error?: boolean;
  ready?: boolean;
  onFinished?: () => void;
}) {
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReducedMotion(value);
      })
      .catch(() => {
        if (active) setReducedMotion(true);
      });
    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (reducedMotion !== false || error) {
      reveal.setValue(1);
      pulse.setValue(0);
      return;
    }
    reveal.setValue(0);
    const entrance = Animated.timing(reveal, {
      toValue: 1,
      duration: t.motion.launchReveal,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const loading = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: t.motion.launchPulse / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: t.motion.launchPulse / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    entrance.start();
    loading.start();
    return () => {
      entrance.stop();
      loading.stop();
    };
  }, [error, pulse, reducedMotion, reveal]);
  useEffect(() => {
    if (!ready || !onFinished || reducedMotion === null) return;
    if (reducedMotion) {
      onFinished();
      return;
    }
    const exit = Animated.timing(opacity, {
      toValue: 0,
      duration: t.motion.sheet,
      useNativeDriver: true,
    });
    exit.start(({ finished }) => {
      if (finished) onFinished();
    });
    return () => exit.stop();
  }, [onFinished, opacity, ready, reducedMotion]);
  return (
    <Animated.View
      style={[s.screen, { opacity }]}
      accessibilityLabel="Loading Auction NG"
      accessibilityViewIsModal={!ready}
      pointerEvents={ready ? 'none' : 'auto'}
    >
      <StatusBar style="light" />
      <View style={s.topRule} />
      <View style={s.backdrop} pointerEvents="none" />
      <View style={[s.backdrop, s.backdropInner]} pointerEvents="none" />
      <View style={s.identity}>
        <View
          style={s.artwork}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={s.ring} />
          <View style={[s.ring, s.innerRing]} />
          <Animated.View
            style={[
              s.iconTile,
              {
                transform: [
                  {
                    rotate: reveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['-12deg', '0deg'],
                    }),
                  },
                  {
                    scale: reveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Gavel size={56} strokeWidth={1.8} color={t.colors['indigo-900']} />
          </Animated.View>
          <View style={s.accent} />
        </View>
        <Image
          source={wordmark}
          style={s.wordmark}
          resizeMode="contain"
          accessibilityLabel="Auction NG"
        />
      </View>
      <View style={s.bottom}>
        <Image
          source={tagline}
          style={s.tagline}
          resizeMode="contain"
          accessibilityLabel="Bid. Win. Save."
        />
        {error ? (
          <Text style={s.error}>
            The app could not finish loading. Close Auction NG and try again.
          </Text>
        ) : (
          <View
            style={s.dots}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Preparing the marketplace"
          >
            {[0, 1, 2].map((index) => (
              <Animated.View
                key={index}
                style={[
                  s.dot,
                  {
                    opacity:
                      reducedMotion !== false
                        ? 1
                        : pulse.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange:
                              index === 1 ? [1, 0.35, 1] : [0.35, 1, 0.35],
                          }),
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}
