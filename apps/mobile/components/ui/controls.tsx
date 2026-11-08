import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { X, ChevronDown } from 'lucide-react-native';
import { parseNairaInput } from '@auction-ng/ui/presentation';
import { mobileTheme } from '@auction-ng/ui';
import { focusedFieldOffset } from '../../lib/keyboard-reveal';
import { styles as s, colors } from './styles';
import { AnchoredSelect } from './anchored-select';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

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
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'small' | 'regular' | 'large';
  accessibilityLabel?: string;
  fullWidth?: boolean;
}) {
  const variantStyle = {
    primary: s.buttonPrimary,
    secondary: s.buttonSecondary,
    ghost: s.buttonGhost,
    danger: s.buttonDanger,
    success: s.buttonSuccess,
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
        (disabled || busy) && variant === 'success' && s.disabledAction,
        pressed && variant === 'primary' && s.buttonPressed,
        pressed && variant === 'success' && s.disabled,
      ]}
    >
      <Text
        style={[
          s.text,
          s.buttonText,
          variant === 'primary' || variant === 'danger' || variant === 'success'
            ? s.onBrand
            : s.brandText,
          (disabled || busy) && variant === 'success' && s.disabledActionText,
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
  prefix,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  prefix?: string;
}) {
  const [focused, setFocused] = useState(false);
  const id = useId();
  return (
    <View style={s.field}>
      <Text nativeID={id} style={[s.text, s.label]}>
        {label}
      </Text>
      <View style={s.inputFrame}>
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
            prefix && s.inputWithPrefix,
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
        {prefix && (
          <View pointerEvents="none" accessible={false} style={s.inputPrefix}>
            <Text style={[s.text, s.inputPrefixText]}>{prefix}</Text>
          </View>
        )}
      </View>
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
  footer,
  headerAccessory,
  expanded = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  presentation?: 'dialog' | 'sheet';
  footer?: ReactNode;
  headerAccessory?: ReactNode;
  expanded?: boolean;
}) {
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);
  const viewportRef = useRef<React.ComponentRef<typeof View>>(null);
  const bodyRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const bodyOffset = useRef(0);
  const revealField = () => {
    if (!expanded || !open) return;
    requestAnimationFrame(() => {
      const input = TextInput.State.currentlyFocusedInput();
      if (!input) return;
      bodyRef.current?.measureInWindow((_x, top, _width, height) => {
        input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
          if (input !== TextInput.State.currentlyFocusedInput()) return;
          const nextOffset = focusedFieldOffset(
            bodyOffset.current,
            top,
            height,
            inputTop,
            inputHeight,
            mobileTheme.spacing.lg,
          );
          if (nextOffset > bodyOffset.current)
            bodyRef.current?.scrollTo({
              y: nextOffset,
              animated: false,
            });
        });
      });
    });
  };
  const [keyboardHeight, setKeyboardHeight] = useState<number>();
  const keyboardTop = useRef<number | undefined>(undefined);
  const measureViewport = () => {
    viewportRef.current?.measureInWindow((_x, top, _width, height) => {
      const keyboardY = keyboardTop.current;
      setKeyboardHeight(
        keyboardY === undefined
          ? undefined
          : Math.max(0, Math.min(height, keyboardY - top)),
      );
    });
  };
  useEffect(() => {
    if (!open || !expanded) {
      setKeyboardHeight(undefined);
      return;
    }
    // Android modal windows can overlay the keyboard without resizing. Bound
    // this sheet to the measured keyboard top instead of relying on adjustResize.
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      measureViewport();
    });
    const change = Keyboard.addListener('keyboardDidChangeFrame', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      measureViewport();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = undefined;
      setKeyboardHeight(undefined);
    });
    keyboardTop.current = Keyboard.metrics()?.screenY;
    measureViewport();
    return () => {
      show.remove();
      change.remove();
      hide.remove();
    };
  }, [open, expanded]);
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
      <SafeAreaProvider>
        <SafeAreaView
          ref={viewportRef}
          onLayout={expanded ? measureViewport : undefined}
          edges={['top', 'bottom', 'left', 'right']}
          style={[
            s.modalRoot,
            expanded && keyboardHeight !== undefined && s.keyboardModalRoot,
          ]}
        >
          <KeyboardAvoidingView
            enabled={!expanded}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[
              s.modalRoot,
              presentation === 'sheet' && s.sheetRoot,
              expanded &&
                keyboardHeight !== undefined && {
                  flex: 0,
                  height: keyboardHeight,
                },
            ]}
          >
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
              style={[
                s.modal,
                presentation === 'sheet' && s.sheet,
                expanded && s.modalExpanded,
              ]}
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
                  <X
                    size={24}
                    strokeWidth={1.75}
                    color={colors['indigo-900']}
                  />
                </Pressable>
              </View>
              {headerAccessory}
              <ScrollView
                ref={bodyRef}
                onFocusCapture={revealField}
                onLayout={revealField}
                onScroll={(event) => {
                  bodyOffset.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
              >
                {children}
              </ScrollView>
              {footer}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

export function Select({
  label,
  options,
  value,
  onChange,
  presentation = 'sheet',
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  presentation?: 'sheet' | 'inline' | 'dropdown';
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  if (presentation === 'dropdown')
    return (
      <AnchoredSelect
        label={label}
        options={options}
        value={value}
        onChange={onChange}
      />
    );
  return (
    <View style={s.field}>
      <Body tone="secondary">{label}</Body>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selected?.label ?? 'Choose an option'}`}
        accessibilityState={{ expanded: open }}
        style={[s.input, s.row]}
        onPress={() => setOpen((current) => !current)}
      >
        <Body>{selected?.label ?? 'Choose an option'}</Body>
        <ChevronDown color={colors['slate-600']} size={20} strokeWidth={1.75} />
      </Pressable>
      {presentation === 'inline' ? (
        open && (
          <View style={s.field} accessibilityRole="radiogroup">
            {options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: value === option.value }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={[s.input, value === option.value && s.inputFocus]}
              >
                <Body>{option.label}</Body>
              </Pressable>
            ))}
          </View>
        )
      ) : (
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
      )}
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
