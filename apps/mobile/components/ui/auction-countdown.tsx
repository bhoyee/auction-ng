import { View } from 'react-native';
import { auctionCountdown } from '../../lib/auction-countdown';
import { Body } from './controls';
import { countdownStyles as s } from './countdown-styles';

export function AuctionCountdown({
  photo = false,
  large = false,
  ...props
}: Parameters<typeof auctionCountdown>[0] & {
  photo?: boolean;
  large?: boolean;
}) {
  const value = auctionCountdown(props);
  const timer = (
    <View
      accessible
      accessibilityLabel={value.label}
      style={[
        s.timer,
        photo && s.photoTimer,
        large && s.large,
        value.urgent && s.urgent,
      ]}
    >
      {value.message ? (
        <Body style={[s.text, large && s.largeText]}>{value.message}</Body>
      ) : (
        value.segments.map((part, index) => (
          <View
            key={part.unit}
            style={[s.cell, index > 0 && s.divider, large && s.largeCell]}
          >
            <Body style={[s.text, large && s.largeText]}>
              {part.value}
              {part.unit}
            </Body>
          </View>
        ))
      )}
    </View>
  );
  return photo ? (
    <View pointerEvents="none" style={s.photo}>
      {timer}
    </View>
  ) : (
    timer
  );
}
