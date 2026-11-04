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
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import {
  focusedFieldScroll,
  keyboardOverlap,
  focusFieldNearTop,
} from '../../lib/keyboard-visibility';

const KeyboardFieldFocus = createContext<(() => void) | null>(null);
export function useKeyboardFieldFocus() {
  return useContext(KeyboardFieldFocus);
}

export function KeyboardFormScroll({ children }: { children: ReactNode }) {
  const container = useRef<ComponentRef<typeof View>>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const focusWithin = useRef(false);
  const alignFocusedField = useRef(false);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(
    Keyboard.metrics()?.screenY ?? null,
  );
  const frame = useRef<number | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const [overlap, setOverlap] = useState(0);
  const reveal = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const input = TextInput.State.currentlyFocusedInput();
      const top = keyboardTop.current;
      if (!focusWithin.current || !input || top === null) return;
      scroll.current?.measureInWindow((_x, y, _width, height) => {
        input.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
          if (
            !mounted.current ||
            input !== TextInput.State.currentlyFocusedInput() ||
            keyboardTop.current !== top
          )
            return;
          // All values are screen coordinates, including modal/header offsets.
          if (height <= 0 || inputHeight <= 0) return;
          const next = alignFocusedField.current
            ? focusFieldNearTop(inputY, y, scrollY.current, t.spacing['2xl'])
            : focusedFieldScroll(
                inputY + inputHeight,
                y + height,
                top,
                scrollY.current,
                t.spacing.lg,
              );
          alignFocusedField.current = false;
          if (next !== null)
            scroll.current?.scrollTo({ y: next, animated: false });
        });
      });
    });
  }, []);
  const measure = useCallback(() => {
    container.current?.measureInWindow((_x, y, _width, height) => {
      if (mounted.current)
        setOverlap(keyboardOverlap(y, height, keyboardTop.current));
      reveal();
    });
  }, [reveal]);
  useEffect(() => {
    mounted.current = true;
    const show = (event: KeyboardEvent) => {
      keyboardTop.current = event.endCoordinates.screenY;
      alignFocusedField.current = true;
      measure();
      // Android may finish modal resizing after its keyboard event.
      if (retry.current) clearTimeout(retry.current);
      retry.current = setTimeout(measure, 200);
    };
    const hide = () => {
      keyboardTop.current = null;
      setOverlap(0);
    };
    const listeners = [
      Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardWillShow', show),
      Keyboard.addListener('keyboardWillChangeFrame', show),
      Keyboard.addListener('keyboardDidHide', hide),
    ];
    return () => {
      mounted.current = false;
      listeners.forEach((listener) => listener.remove());
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [measure]);
  return (
    <View
      ref={container}
      style={[s.fill, { paddingBottom: overlap }]}
      onLayout={measure}
    >
      <ScrollView
        ref={scroll}
        style={s.fill}
        contentContainerStyle={s.content}
        automaticallyAdjustKeyboardInsets={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onFocusCapture={() => {
          focusWithin.current = true;
          alignFocusedField.current = true;
          reveal();
        }}
        onBlurCapture={() => {
          focusWithin.current = false;
        }}
        onLayout={reveal}
        onContentSizeChange={reveal}
      >
        <KeyboardFieldFocus.Provider
          value={() => {
            focusWithin.current = true;
            alignFocusedField.current = true;
            reveal();
          }}
        >
          {children}
        </KeyboardFieldFocus.Provider>
      </ScrollView>
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
