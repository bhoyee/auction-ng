import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import type { BidMode } from '@auction-ng/shared/auction-rules';
import { art } from '../illustrations/palette';

const options: { value: BidMode; label: string }[] = [
  { value: 'direct', label: 'Bid full amount' },
  { value: 'automatic', label: 'Auto-bid limit' },
];

/**
 * Bidding method as a two-part toggle (owner request, 2026-11-21): both
 * choices stay visible and switch in one tap. "Bid full amount" remains the
 * default; the caller owns the value. Labels shrink to one line instead of
 * wrapping on narrow phones or with large text settings.
 */
export function BidModeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: BidMode;
  onChange: (value: BidMode) => void;
  disabled?: boolean;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Bidding method"
      style={[s.track, disabled && s.disabled]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => !selected && onChange(option.value)}
            style={({ pressed }) => [
              s.segment,
              selected && s.selected,
              pressed && !selected && s.pressed,
            ]}
          >
            <Text
              style={[s.label, selected && s.labelSelected]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.3}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Help under the toggle, highlighted so it is easy to spot (owner request,
 * 2026-11-21): a light yellow box with a gold edge for every method, text
 * kept small and regular.
 */
export function BidHint({ message }: { message: string }) {
  return (
    <View style={s.hint} accessibilityLiveRegion="polite">
      <Info size={16} color={art.goldDeep} style={s.hintIcon} />
      <Text style={s.hintText} maxFontSizeMultiplier={1.3}>
        {message}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    gap: 3,
    borderRadius: 12,
    backgroundColor: t.colors['indigo-50'],
    borderWidth: 1,
    borderColor: t.colors.line,
  },
  disabled: { opacity: 0.6 },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: t.layout.touch,
    paddingHorizontal: t.spacing.sm,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: t.colors.surface,
    shadowColor: t.colors.ink,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  pressed: { opacity: 0.7 },
  label: {
    fontFamily: t.fontFamily,
    fontSize: 13,
    fontWeight: '500',
    color: t.colors['slate-600'],
  },
  labelSelected: { color: t.colors['indigo-900'] },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    backgroundColor: art.peach,
    borderLeftColor: art.goldDeep,
  },
  hintIcon: { marginTop: 1 },
  hintText: {
    flex: 1,
    fontFamily: t.fontFamily,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    color: t.colors.ink,
  },
});
