import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { art } from './palette';

/**
 * GiddyDeal's own shortcut illustrations (owner-approved custom art,
 * 2026-11-20): flat shapes with one highlight each, drawn on a 64-unit
 * grid so they stay crisp at any size. Decorative: callers label the
 * button, so the drawings are hidden from screen readers.
 */
type ArtProps = { size?: number };

function Sparkle({
  x,
  y,
  r,
  fill,
}: {
  x: number;
  y: number;
  r: number;
  fill: string;
}) {
  return (
    <Path
      d={`M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`}
      fill={fill}
    />
  );
}

/** All Deals: a shopping bag with a price tag. */
export function AllDealsArt({ size = 56 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Defs>
        <LinearGradient id="bag" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={art.indigoMid} />
          <Stop offset="1" stopColor={art.indigo} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="32" cy="57" rx="18" ry="3" fill={art.ink} opacity={0.12} />
      <Path
        d="M24 24v-5a8 8 0 0 1 16 0v5"
        stroke={art.indigo}
        strokeWidth={3.2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M13 24h38l-3 30a3 3 0 0 1-3 2.7H19a3 3 0 0 1-3-2.7Z"
        fill="url(#bag)"
      />
      <Path
        d="M16 24h10l-2 32h-5a3 3 0 0 1-3-2.7Z"
        fill={art.white}
        opacity={0.12}
      />
      <Circle cx="24" cy="30" r="2" fill={art.goldLight} />
      <Circle cx="40" cy="30" r="2" fill={art.goldLight} />
      <G rotation={-18} origin="44, 40">
        <Path
          d="M34 33h16a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H34l-5-7Z"
          fill={art.gold}
        />
        <Circle cx="34.5" cy="40" r="1.8" fill={art.indigo} />
        <SvgText
          x="44"
          y="43.6"
          fontSize="10"
          fontWeight="800"
          fill={art.indigo}
          textAnchor="middle"
        >
          %
        </SvgText>
      </G>
      <Sparkle x={51} y={14} r={4} fill={art.gold} />
      <Sparkle x={12} y={15} r={2.6} fill={art.indigoLight} />
    </Svg>
  );
}

/** Top Deals: a gold rosette with a star. */
export function TopDealsArt({ size = 56 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Defs>
        <LinearGradient id="medal" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={art.goldLight} />
          <Stop offset="1" stopColor={art.goldDeep} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="32" cy="58" rx="14" ry="2.6" fill={art.ink} opacity={0.12} />
      <Path d="M22 36 15 55l8-3 4 7 6-18Z" fill={art.indigoMid} />
      <Path d="M42 36l7 19-8-3-4 7-6-18Z" fill={art.indigo} />
      <Path
        d="M32 6l4.2 3.4 5.3-1 2.1 5 5 2.1-1 5.3L51 25l-3.4 4.2 1 5.3-5 2.1-2.1 5-5.3-1L32 44l-4.2-3.4-5.3 1-2.1-5-5-2.1 1-5.3L13 25l3.4-4.2-1-5.3 5-2.1 2.1-5 5.3 1Z"
        fill="url(#medal)"
      />
      <Circle
        cx="32"
        cy="25"
        r="12.5"
        fill={art.gold}
        stroke={art.white}
        strokeWidth={2}
      />
      <Path
        d="M32 17.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L32 29.3l-4.6 2.5.9-5.2-3.8-3.6 5.2-.7Z"
        fill={art.indigo}
      />
      <Sparkle x={53} y={10} r={3.6} fill={art.indigoLight} />
    </Svg>
  );
}

/** Ending Soon: a stopwatch with the last slice of time in gold. */
export function EndingSoonArt({ size = 56 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Ellipse cx="32" cy="59" rx="15" ry="2.6" fill={art.ink} opacity={0.12} />
      <Rect x="27" y="6" width="10" height="6" rx="2" fill={art.indigo} />
      <Rect x="30" y="11" width="4" height="5" fill={art.indigo} />
      <Path
        d="m47 14 4 4"
        stroke={art.indigo}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <Circle cx="32" cy="36" r="20" fill={art.indigo} />
      <Circle cx="32" cy="36" r="16" fill={art.white} />
      <Path d="M32 36V20a16 16 0 0 1 13.9 8Z" fill={art.gold} />
      <Path
        d="M32 36V25M32 36l7 4"
        stroke={art.indigo}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx="32" cy="36" r="2.4" fill={art.red} />
      <Path
        d="M18 21a20 20 0 0 1 6-5"
        stroke={art.white}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.5}
      />
      <Sparkle x={11} y={22} r={3} fill={art.gold} />
    </Svg>
  );
}

/** Instant Win: a gold trophy. */
export function InstantWinArt({ size = 56 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Defs>
        <LinearGradient id="cup" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={art.goldLight} />
          <Stop offset="0.55" stopColor={art.gold} />
          <Stop offset="1" stopColor={art.goldDeep} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="32" cy="59" rx="15" ry="2.6" fill={art.ink} opacity={0.12} />
      <Path
        d="M20 15H11v5a10 10 0 0 0 10 10M44 15h9v5a10 10 0 0 1-10 10"
        stroke={art.goldDeep}
        strokeWidth={3.4}
        fill="none"
        strokeLinecap="round"
      />
      <Path d="M18 9h28v12a14 14 0 0 1-28 0Z" fill="url(#cup)" />
      <Path
        d="M22 12h5v10a9 9 0 0 0 3 6.7A11 11 0 0 1 22 21Z"
        fill={art.white}
        opacity={0.35}
      />
      <Rect x="29" y="34" width="6" height="9" fill={art.goldDeep} />
      <Path d="M22 43h20l2 8H20Z" fill={art.indigoMid} />
      <Rect x="17" y="50" width="30" height="6" rx="2" fill={art.indigo} />
      <Path
        d="M32 14l1.7 3.5 3.9.5-2.8 2.7.7 3.8L32 22.7l-3.5 1.8.7-3.8-2.8-2.7 3.9-.5Z"
        fill={art.white}
      />
      <Sparkle x={54} y={8} r={3.6} fill={art.gold} />
      <Sparkle x={9} y={8} r={2.4} fill={art.indigoLight} />
    </Svg>
  );
}

/** Upcoming: a calendar with the go-live day marked. */
export function UpcomingArt({ size = 56 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Ellipse cx="32" cy="59" rx="17" ry="2.6" fill={art.ink} opacity={0.12} />
      <Rect
        x="10"
        y="12"
        width="44"
        height="42"
        rx="7"
        fill={art.white}
        stroke={art.indigo}
        strokeWidth={3}
      />
      <Path d="M10 19a7 7 0 0 1 7-7h30a7 7 0 0 1 7 7v6H10Z" fill={art.indigo} />
      <Rect x="20" y="7" width="4" height="10" rx="2" fill={art.indigoMid} />
      <Rect x="40" y="7" width="4" height="10" rx="2" fill={art.indigoMid} />
      {[0, 1, 2, 3].map((col) =>
        [0, 1].map((row) => (
          <Rect
            key={`${col}-${row}`}
            x={16 + col * 9}
            y={31 + row * 9}
            width="5"
            height="5"
            rx="1.4"
            fill={art.indigoLight}
          />
        )),
      )}
      <Circle cx="43.5" cy="42.5" r="7" fill={art.gold} />
      <Path
        d="m40.3 42.6 2.2 2.2 4.4-4.6"
        stroke={art.indigo}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Sparkle x={56} y={8} r={3.2} fill={art.gold} />
    </Svg>
  );
}

/** Large trophy for the win celebration. */
export function CelebrationTrophyArt({ size = 112 }: ArtProps) {
  return <InstantWinArt size={size} />;
}

/** One balloon: body, highlight, knot and string. */
export function BalloonArt({
  colour,
  width = 46,
}: {
  colour: string;
  width?: number;
}) {
  const height = width * 2.1;
  return (
    <Svg width={width} height={height} viewBox="0 0 46 96" accessible={false}>
      <Path
        d="M23 60c-1.5 8 4 12 0 20s3 10 1 16"
        stroke={art.white}
        strokeWidth={1.4}
        fill="none"
        opacity={0.75}
      />
      <Path d="M20 58h6l-3 4Z" fill={colour} />
      <Ellipse cx="23" cy="30" rx="21" ry="28" fill={colour} />
      <Ellipse
        cx="15"
        cy="18"
        rx="5"
        ry="9"
        fill={art.white}
        opacity={0.35}
        rotation={-20}
        origin="15, 18"
      />
    </Svg>
  );
}
