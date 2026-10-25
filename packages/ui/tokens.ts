export const tokens = {
  colors: {
    'indigo-900': '#1C2A6B',
    'indigo-700': '#2E3F94',
    'indigo-50': '#EEF0FA',
    'danfo-400': '#FFC629',
    ink: '#151A30',
    'slate-600': '#556074',
    line: '#E3E6EC',
    surface: '#FFFFFF',
    canvas: '#F5F6F8',
    'win-600': '#127A55',
    'outbid-600': '#C8341C',
  },
  fontFamily: 'Schibsted Grotesk',
  layout: { content: 1240, gutter: 24, touch: 44 },
  opacity: { disabled: 0.55 },
  motion: { flash: 300, sheet: 200 },
  shadow: { floating: '0 12px 40px rgb(21 26 48 / 16%)' },
  measure: { body: 600 },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
    '4xl': 64,
  },
  radius: { badge: 4, control: 8, card: 12, sheet: 16 },
  typography: {
    title: { fontSize: 32, lineHeight: 38 },
    section: { fontSize: 24, lineHeight: 30 },
    detail: { fontSize: 20, lineHeight: 26 },
    body: { fontSize: 16, lineHeight: 24 },
    secondary: { fontSize: 14, lineHeight: 20 },
    fine: { fontSize: 12, lineHeight: 16 },
  },
} as const;

export const mobileTheme = {
  ...tokens,
  typography: {
    ...tokens.typography,
    title: { fontSize: 30, lineHeight: 36 },
    section: { fontSize: 22, lineHeight: 28 },
  },
} as const;
