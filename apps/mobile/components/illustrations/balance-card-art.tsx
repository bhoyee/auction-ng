import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { art } from './palette';

/**
 * Background pattern for the Account wallet cards (owner request,
 * 2026-11-21): a soft sheen, rings in the top corner and a wave along the
 * bottom, like a bank card. Drawn on a 200×140 box and stretched to fit;
 * decorative only, so it is hidden from screen readers and touches.
 */
export function BalanceCardArt({ tone }: { tone: 'balance' | 'reserved' }) {
  const balance = tone === 'balance';
  const base = balance ? art.indigo : art.gold;
  const sheen = balance ? art.indigoMid : art.goldLight;
  const ring = balance ? art.indigoLight : art.white;
  const wave = balance ? art.gold : art.goldDeep;
  const id = `card-${tone}`;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 200 140"
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop
              offset="0"
              stopColor={sheen}
              stopOpacity={balance ? 0.9 : 1}
            />
            <Stop offset="0.65" stopColor={base} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="200" height="140" fill={`url(#${id})`} />
        <Circle
          cx="186"
          cy="10"
          r="54"
          fill="none"
          stroke={ring}
          strokeOpacity={0.16}
          strokeWidth="14"
        />
        <Circle cx="186" cy="10" r="26" fill={ring} fillOpacity={0.12} />
        <Path
          d="M0 118 C 40 98, 80 136, 124 116 S 182 100, 200 108 L 200 140 L 0 140 Z"
          fill={wave}
          fillOpacity={balance ? 0.22 : 0.35}
        />
        <Path
          d="M0 128 C 46 112, 90 142, 136 126 S 186 116, 200 122"
          fill="none"
          stroke={ring}
          strokeOpacity={0.18}
          strokeWidth="1.5"
        />
      </Svg>
    </View>
  );
}
