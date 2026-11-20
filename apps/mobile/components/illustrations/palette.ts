import { mobileTheme as t } from '@auction-ng/ui';

/**
 * Illustration colours: the brand tokens plus the lighter tints and shades
 * the drawings need for depth (owner-approved custom art, 2026-11-20).
 * Screens keep using the shared tokens; only artwork reads this palette.
 */
export const art = {
  indigo: t.colors['indigo-900'],
  indigoMid: t.colors['indigo-700'],
  indigoSoft: t.colors['indigo-50'],
  indigoLight: '#C9D0F2',
  gold: t.colors['danfo-400'],
  goldLight: '#FFE08A',
  goldDeep: '#E5A800',
  ink: t.colors.ink,
  white: t.colors.surface,
  green: t.colors['win-600'],
  greenLight: '#DCFCE7',
  red: t.colors['outbid-600'],
  teal: t.colors['chart-teal'],
  amber: t.colors['chart-amber'],
  sky: '#D9ECFF',
  peach: '#FFF1D6',
  mint: '#E3F7EF',
} as const;

/** Balloon and confetti colours for the win celebration. */
// Bright enough to stand out on the indigo celebration backdrop.
export const celebrationColours = [
  art.gold,
  '#7EA6FF',
  art.teal,
  art.red,
  art.white,
  art.amber,
  '#3FC48D',
] as const;

/** Accents for the home summary cards on indigo (6-digit hex for tints). */
export const cardAccents = {
  gold: art.gold,
  sky: '#7EA6FF',
  green: '#3FC48D',
} as const;
