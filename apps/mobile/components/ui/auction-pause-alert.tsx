import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CirclePause } from 'lucide-react-native';
import { mobileTheme as theme } from '@auction-ng/ui';
import { auctionPauseCopy } from '@auction-ng/api-client/realtime';
import { useAuctionControl } from '../../lib/realtime';
import { Body, Button, Dialog } from './controls';
import { styles as s, colors } from './styles';
let sessionDismissed: string | undefined;
export function AuctionPauseAlert() {
  const control = useAuctionControl(),
    insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(sessionDismissed);
  const [resumed, setResumed] = useState(false);
  const lastPaused = useRef(false);
  useEffect(() => {
    if (!control?.connected) return;
    if (lastPaused.current && !control.paused) setResumed(true);
    if (control.paused) setResumed(false);
    lastPaused.current = control.paused;
  }, [control?.revision, control?.connected, control?.paused]);
  useEffect(() => {
    if (!resumed) return;
    const timer = setTimeout(() => setResumed(false), 8000);
    return () => clearTimeout(timer);
  }, [resumed]);
  function dismiss() {
    sessionDismissed = control?.revision;
    setDismissed(sessionDismissed);
  }
  return (
    <>
      {(control?.paused || resumed) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            control?.paused
              ? 'Read bidding pause update'
              : auctionPauseCopy.resumed
          }
          onPress={() =>
            control?.paused ? setDismissed(undefined) : setResumed(false)
          }
          style={[
            s.pauseBanner,
            { bottom: insets.bottom + theme.layout.touch * 2 },
            !control?.paused && s.pauseResumed,
          ]}
        >
          <Body
            tone="fine"
            style={control?.paused ? s.pauseBannerText : s.pauseResumedText}
          >
            {control?.paused
              ? auctionPauseCopy.banner + ' Tap for details.'
              : auctionPauseCopy.resumed}
          </Body>
        </Pressable>
      )}
      <Dialog
        open={
          !!control?.connected &&
          control.paused &&
          dismissed !== control.revision
        }
        title={auctionPauseCopy.title}
        onClose={dismiss}
      >
        <View style={s.pauseContent}>
          <View style={s.pauseIcon}>
            <CirclePause size={36} color={colors.ink} />
          </View>
          <Body>{auctionPauseCopy.body}</Body>
          <Body>{auctionPauseCopy.reassurance}</Body>
          <Body tone="fine">{auctionPauseCopy.payments}</Body>
          <Button fullWidth onPress={dismiss}>
            {auctionPauseCopy.action}
          </Button>
        </View>
      </Dialog>
    </>
  );
}
