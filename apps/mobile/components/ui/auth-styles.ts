import { StyleSheet } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';

export const authStyles = StyleSheet.create({
  password: { width: '100%', position: 'relative' },
  passwordInput: { width: '100%', paddingRight: t.layout.touch + t.spacing.md },
  eye: {
    position: 'absolute',
    right: t.spacing.xs,
    bottom: 0,
    width: t.layout.touch,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: t.opacity.disabled },
  heading: {
    padding: t.spacing.lg,
    borderRadius: t.radius.sheet,
    backgroundColor: t.colors['indigo-50'],
    gap: t.spacing.sm,
  },
  headingRow: { flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' },
  headingText: { flex: 1, fontWeight: '700', color: t.colors['indigo-900'] },
  copy: { fontSize: 14, lineHeight: 21, color: t.colors['slate-600'] },
  form: {
    width: '100%',
    gap: t.spacing.lg,
    padding: t.spacing.lg,
    borderRadius: t.radius.sheet,
    borderWidth: 1,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface,
  },
});
