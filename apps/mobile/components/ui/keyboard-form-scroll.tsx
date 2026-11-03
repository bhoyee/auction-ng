import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';

export function KeyboardFormScroll({ children }: { children: ReactNode }) {
  const container = useRef<ComponentRef<typeof View>>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const focusWithin = useRef(false);
  const frame = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const reveal = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const input = TextInput.State.currentlyFocusedInput();
      if (focusWithin.current && input && Keyboard.isVisible()) {
        scroll.current?.scrollResponderScrollNativeHandleToKeyboard(
          input,
          t.spacing.lg,
          true,
        );
      }
    });
  }, []);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return (
    <View
      ref={container}
      style={s.fill}
      onLayout={() => {
        // The form can be below a native modal header or a safe-area inset.
        container.current?.measureInWindow((_x, y) => setOffset(y));
        reveal();
      }}
    >
      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={offset}
      >
        <ScrollView
          ref={scroll}
          style={s.fill}
          contentContainerStyle={s.content}
          automaticallyAdjustKeyboardInsets={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onFocusCapture={() => {
            focusWithin.current = true;
            reveal();
          }}
          onBlurCapture={() => {
            focusWithin.current = false;
          }}
          onKeyboardDidShow={reveal}
          onLayout={reveal}
          onContentSizeChange={reveal}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const s = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: t.spacing.lg,
    gap: t.spacing.xl,
    paddingBottom: t.spacing['4xl'],
  },
});
