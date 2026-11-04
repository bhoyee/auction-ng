import {
  createContext,
  useContext,
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
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';

const KeyboardFieldFocus = createContext<(() => void) | null>(null);
export function useKeyboardFieldFocus() {
  return useContext(KeyboardFieldFocus);
}

export function KeyboardFormScroll({ children }: { children: ReactNode }) {
  const container = useRef<ComponentRef<typeof View>>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const focusWithin = useRef(false);
  const frame = useRef<number | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const [offset, setOffset] = useState(0);
  const reveal = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const input = TextInput.State.currentlyFocusedInput();
      if (!focusWithin.current || !input || !Keyboard.isVisible()) return;
      scroll.current?.measureInWindow((_x, y) => {
        if (
          !mounted.current ||
          input !== TextInput.State.currentlyFocusedInput()
        )
          return;
        // RN's scroll responder measures the input relative to content; include
        // this viewport's origin so the page header does not hide the field.
        scroll.current?.scrollResponderScrollNativeHandleToKeyboard(
          input,
          y + t.spacing['2xl'],
          true,
        );
      });
    });
  }, []);
  const focus = useCallback(() => {
    focusWithin.current = true;
    reveal();
    if (retry.current) clearTimeout(retry.current);
    retry.current = setTimeout(reveal, 250);
  }, [reveal]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (retry.current) clearTimeout(retry.current);
    };
  }, []);
  return (
    <View
      ref={container}
      style={s.fill}
      onLayout={() => {
        container.current?.measureInWindow((_x, y) => {
          if (mounted.current) setOffset(y);
        });
      }}
    >
      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={offset}
        onLayout={reveal}
      >
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          <View style={s.fill}>
            <ScrollView
              ref={scroll}
              style={s.fill}
              contentContainerStyle={s.content}
              automaticallyAdjustKeyboardInsets={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onFocusCapture={focus}
              onBlurCapture={() => {
                focusWithin.current = false;
              }}
              onKeyboardDidShow={focus}
              onLayout={reveal}
              onContentSizeChange={reveal}
            >
              <KeyboardFieldFocus.Provider value={focus}>
                {children}
              </KeyboardFieldFocus.Provider>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}
const s = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: t.spacing.lg,
    gap: t.spacing.xl,
    paddingBottom: t.spacing['4xl'],
  },
});
