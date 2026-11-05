import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import {
  CreditCard,
  Landmark,
  ChevronDown,
  Circle,
  CircleCheck,
} from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { Body, Dialog } from './controls';

const methods = [
  {
    value: 'local_card',
    label: 'Nigerian card',
    description: 'Pay with a card issued in Nigeria.',
    icon: CreditCard,
  },
  {
    value: 'international_card',
    label: 'International card',
    description: 'Pay with a card issued outside Nigeria.',
    icon: CreditCard,
  },
  {
    value: 'bank_transfer',
    label: 'One-time bank transfer',
    description: 'Get bank details for this payment in secure checkout.',
    icon: Landmark,
  },
] as const;

export function PaymentMethodPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = methods.find((method) => method.value === value);
  const Icon = selected?.icon ?? CreditCard;
  return (
    <View style={s.field}>
      <Body tone="secondary">Payment method</Body>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Payment method, ${selected?.label ?? 'Choose a method'}`}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        style={s.trigger}
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
      >
        <Icon size={22} color={t.colors['indigo-900']} />
        <Body style={s.value}>
          {selected?.label ?? 'Choose a payment method'}
        </Body>
        <ChevronDown size={20} color={t.colors['indigo-900']} />
      </Pressable>
      <Dialog
        open={open}
        title="Choose payment method"
        presentation="sheet"
        onClose={() => setOpen(false)}
      >
        <View style={s.options} accessibilityRole="radiogroup">
          {methods.map((method) => {
            const checked = method.value === value;
            const Mark = checked ? CircleCheck : Circle;
            return (
              <Pressable
                key={method.value}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                style={[s.option, checked && s.selected]}
                onPress={() => {
                  onChange(method.value);
                  setOpen(false);
                }}
              >
                <method.icon size={24} color={t.colors['indigo-900']} />
                <View style={s.copy}>
                  <Body style={s.label}>{method.label}</Body>
                  <Body tone="fine">{method.description}</Body>
                </View>
                <Mark size={22} color={t.colors['indigo-900']} />
              </Pressable>
            );
          })}
        </View>
      </Dialog>
    </View>
  );
}
const s = StyleSheet.create({
  field: { gap: t.spacing.sm },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.control,
    padding: t.spacing.md,
    minHeight: t.layout.touch,
    backgroundColor: t.colors.surface,
  },
  value: { flex: 1, minWidth: 0, ...t.typography.secondary, fontWeight: '600' },
  options: { gap: t.spacing.md, paddingVertical: t.spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.card,
    padding: t.spacing.lg,
    minHeight: t.layout.touch,
  },
  selected: {
    borderColor: t.colors['indigo-900'],
    backgroundColor: t.colors['indigo-50'],
  },
  copy: { flex: 1, minWidth: 0, gap: t.spacing.xs },
  label: { ...t.typography.secondary, fontWeight: '700' },
});
