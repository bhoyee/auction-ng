import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { mobileTheme as t } from '@auction-ng/ui';
import { launchStyles as s } from './launch-styles';
import wordmark from '../../assets/launch-wordmark.png';
import icon from '../../assets/launch-icon.png';
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
  const [artworkLoaded, setArtworkLoaded] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!artworkLoaded) return;
    const timer = setTimeout(
      () => setMinimumElapsed(true),
      t.motion.launchMinimum,
    );
    return () => clearTimeout(timer);
  }, [artworkLoaded]);
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
    if (
      error ||
      !ready ||
      !minimumElapsed ||
      !onFinished ||
      reducedMotion === null
    )
      return;
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
  }, [error, minimumElapsed, onFinished, opacity, ready, reducedMotion]);
  return (
    <Animated.View
      style={[s.screen, { opacity }]}
      accessibilityLabel="Loading LotVanta"
      accessibilityViewIsModal
      pointerEvents="auto"
    >
      <StatusBar style="light" />
      <View style={s.topRule} />
      <View style={s.backdrop} pointerEvents="none" />
      <View style={[s.backdrop, s.backdropInner]} pointerEvents="none" />
      <View style={s.identity}>
        <Animated.View
          style={[
            s.brandGroup,
            {
              opacity: reveal,
              transform: [
                {
                  scale: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                },
                {
                  translateY: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Animated.View
            style={{
              transform: [
                {
                  scale: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.04],
                  }),
                },
              ],
            }}
          >
            <Image source={icon} style={s.brandIcon} resizeMode="contain" />
          </Animated.View>
          <Image
            source={wordmark}
            style={s.wordmark}
            resizeMode="contain"
            accessibilityLabel="LotVanta"
            onLoad={() => setArtworkLoaded(true)}
            onError={() => setArtworkLoaded(true)}
          />
          <Animated.View
            style={[
              s.taglineWrap,
              {
                opacity: reveal.interpolate({
                  inputRange: [0, 0.4, 1],
                  outputRange: [0, 0, 1],
                }),
              },
            ]}
          >
            <Image
              source={tagline}
              style={s.tagline}
              resizeMode="contain"
              accessibilityLabel="Bid. Win. Save."
            />
          </Animated.View>
        </Animated.View>
      </View>
      <View style={s.bottom}>
        {error ? (
          <Text style={s.error}>
            The app could not finish loading. Close LotVanta and try again.
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
