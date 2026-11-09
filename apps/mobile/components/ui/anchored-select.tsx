import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { dropdownPosition } from '../../lib/dropdown-position';

export function AnchoredSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const root = useRef<ComponentRef<typeof View>>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] =
    useState<ReturnType<typeof dropdownPosition>>();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setOpen(false);
    setPosition(undefined);
  }, [width, height]);
  function measure() {
    root.current?.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
      anchor.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
        setPosition(
          dropdownPosition(
            {
              x: x - rootX,
              y: y - rootY,
              width: anchorWidth,
              height: anchorHeight,
            },
            {
              width: rootWidth,
              height: rootHeight,
              top: insets.top + t.spacing.sm,
              bottom: insets.bottom + t.spacing.sm,
            },
            options.length *
              Math.max(
                t.layout.touch,
                t.typography.body.lineHeight * fontScale + 2 * t.spacing.lg,
              ),
            t.spacing.xs,
          ),
        );
      });
    });
  }
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View ref={anchor} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${options.find((o) => o.value === value)?.label ?? 'Choose an option'}`}
          accessibilityState={{ expanded: open }}
          style={[s.trigger, open && s.triggerOpen]}
          onPress={() => {
            Keyboard.dismiss();
            setPosition(undefined);
            setOpen(true);
          }}
        >
          <Text style={s.value}>
            {options.find((o) => o.value === value)?.label ??
              'Choose an option'}
          </Text>
          <Chevron size={20} color={t.colors['indigo-900']} />
        </Pressable>
      </View>
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
        onShow={measure}
      >
        <View ref={root} collapsable={false} style={s.root} onLayout={measure}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close options"
            onPress={() => setOpen(false)}
          />
          {position && (
            <View accessibilityViewIsModal style={[s.menu, position]}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
                {options.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: option.value === value }}
                    style={({ pressed }) => [
                      s.option,
                      option.value === value && s.selected,
                      pressed && s.selected,
                    ]}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        s.value,
                        option.value === value && s.selectedText,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {option.value === value && (
                      <Check size={20} color={t.colors['indigo-900']} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  field: { gap: t.spacing.sm },
  label: {
    fontFamily: t.fontFamily,
    ...t.typography.secondary,
    color: t.colors['slate-600'],
  },
  root: { flex: 1 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    padding: t.spacing.md,
    minHeight: t.layout.touch,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surface,
  },
  triggerOpen: { borderColor: t.colors['indigo-900'] },
  value: {
    flex: 1,
    fontFamily: t.fontFamily,
    ...t.typography.secondary,
    color: t.colors.ink,
  },
  menu: {
    position: 'absolute',
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.control,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: t.colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    padding: t.spacing.lg,
    minHeight: t.layout.touch,
  },
  selected: { backgroundColor: t.colors['indigo-50'] },
  selectedText: { color: t.colors['indigo-900'], fontWeight: '600' },
});
