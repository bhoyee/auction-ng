import { useId, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { X, ChevronDown } from 'lucide-react-native';
import { parseNairaInput } from '@auction-ng/ui/presentation';
import { styles as s, colors } from './styles';

export function Body({
  children,
  tone = 'body',
  ...props
}: React.ComponentProps<typeof Text> & {
  tone?:
    'body' | 'title' | 'section' | 'detail' | 'secondary' | 'fine' | 'brand';
}) {
  const toneStyle = {
    body: undefined,
    title: s.title,
    section: s.sectionTitle,
    detail: s.detail,
    secondary: s.secondary,
    fine: s.fine,
    brand: s.wordmark,
  }[tone];
  return (
    <Text
      {...props}
      style={[
        s.text,
        toneStyle,
        (tone === 'body' || tone === 'secondary') && s.measure,
        props.style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Stack({ children }: { children: ReactNode }) {
  return <View style={s.stack}>{children}</View>;
}
export function Row({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

export function Button({
  children,
  onPress,
  disabled = false,
  busy = false,
  variant = 'primary',
  size = 'regular',
  accessibilityLabel,
  fullWidth = false,
}: {
  children: string;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'regular' | 'large';
  accessibilityLabel?: string;
  fullWidth?: boolean;
}) {
  const variantStyle = {
    primary: s.buttonPrimary,
    secondary: s.buttonSecondary,
    ghost: s.buttonGhost,
    danger: s.buttonDanger,
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        s.button,
        fullWidth ? s.buttonFullWidth : s.buttonIntrinsic,
        variantStyle,
        size === 'small' && s.buttonSmall,
        size === 'large' && s.buttonLarge,
        (disabled || busy) && s.disabled,
        pressed && variant === 'primary' && s.buttonPressed,
      ]}
    >
      <Text
        style={[
          s.text,
          s.buttonText,
          variant === 'primary' || variant === 'danger'
            ? s.onBrand
            : s.brandText,
        ]}
      >
        {busy ? 'Please wait…' : children}
      </Text>
    </Pressable>
  );
}

export function Input({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  const [focused, setFocused] = useState(false);
  const id = useId();
  return (
    <View style={s.field}>
      <Text nativeID={id} style={[s.text, s.label]}>
        {label}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        accessibilityLabelledBy={id}
        placeholderTextColor={colors['slate-600']}
        style={[
          s.text,
          s.input,
          focused && s.inputFocus,
          error && s.inputError,
          props.style,
        ]}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
      />
      {(error || hint) && (
        <Text
          accessibilityLiveRegion={error ? 'polite' : 'none'}
          style={[s.text, s.secondary, error && s.errorText]}
        >
          {error ?? hint}
        </Text>
      )}
    </View>
  );
}
export function OtpInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={6}
      style={s.otp}
    />
  );
}
export function NairaInput({
  onAmountChange,
  ...props
}: Omit<
  React.ComponentProps<typeof Input>,
  'label' | 'onChangeText' | 'value'
> & { onAmountChange: (value: number | undefined) => void }) {
  return (
    <Input
      {...props}
      label="Bid amount (₦)"
      keyboardType="decimal-pad"
      onChangeText={(value) => onAmountChange(parseNairaInput(value))}
    />
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  presentation = 'dialog',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  presentation?: 'dialog' | 'sheet';
}) {
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onShow={() => {
        const node = findNodeHandle(titleRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }}
    >
      <View style={[s.modalRoot, presentation === 'sheet' && s.sheetRoot]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          onPress={onClose}
          style={s.modalBackdrop}
        >
          <View style={s.backdrop} />
        </Pressable>
        <View
          accessibilityViewIsModal
          style={[s.modal, presentation === 'sheet' && s.sheet]}
        >
          <View style={s.row}>
            <Text
              ref={titleRef}
              accessible
              accessibilityRole="header"
              style={[s.text, s.sectionTitle, s.grow]}
            >
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              style={s.button}
            >
              <X size={24} strokeWidth={1.75} color={colors['indigo-900']} />
            </Pressable>
          </View>
          <ScrollView>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Select({
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
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <View style={s.field}>
      <Body tone="secondary">{label}</Body>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selected?.label ?? 'Choose an option'}`}
        accessibilityState={{ expanded: open }}
        style={[s.input, s.row]}
        onPress={() => setOpen(true)}
      >
        <Body>{selected?.label ?? 'Choose an option'}</Body>
        <ChevronDown color={colors['slate-600']} size={20} strokeWidth={1.75} />
      </Pressable>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        presentation="sheet"
      >
        <Stack>
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: value === option.value }}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={s.button}
            >
              <Body>{option.label}</Body>
            </Pressable>
          ))}
        </Stack>
      </Dialog>
    </View>
  );
}

export function Tabs({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly { value: string; label: string; panel: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Stack>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={label}
        style={s.tabs}
      >
        {items.map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: item.value === value }}
            onPress={() => onChange(item.value)}
            style={[s.tab, item.value === value && s.tabActive]}
          >
            <Text
              style={[
                s.text,
                s.label,
                item.value === value ? s.brandText : s.secondary,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {items.find((item) => item.value === value)?.panel}
    </Stack>
  );
}
