import { Children, type ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { mobileTheme as theme } from '@auction-ng/ui';
import {
  Bookmark,
  CheckCircle2,
  CircleAlert,
  WifiOff,
  X,
} from 'lucide-react-native';
import { Body, Button, Row, Stack } from './controls';
import { styles as s, colors } from './styles';

export function LotGrid({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const content = Math.min(width, theme.layout.content) - theme.spacing.lg * 2;
  const columns = width >= 1024 ? 4 : width >= 768 ? 3 : 2;
  const cell = (content - theme.spacing.md * (columns - 1)) / columns;
  return (
    <View style={s.grid}>
      {Children.map(children, (child) => (
        <View style={{ width: cell }}>{child}</View>
      ))}
    </View>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.state}>
      <Bookmark size={24} strokeWidth={1.75} color={colors['slate-600']} />
      <Body tone="detail" accessibilityRole="header">
        {title}
      </Body>
      <Body tone="secondary">{children}</Body>
      {action}
    </View>
  );
}
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View accessibilityLiveRegion="polite" style={s.state}>
      <CircleAlert size={24} strokeWidth={1.75} color={colors['outbid-600']} />
      <Body tone="detail" accessibilityRole="header">
        We could not load these lots
      </Body>
      <Body tone="secondary">Check your connection and try again.</Body>
      <Button variant="secondary" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}
export function OfflineBanner() {
  return (
    <View accessibilityLiveRegion="polite" style={s.banner}>
      <WifiOff size={20} strokeWidth={1.75} color={colors['slate-600']} />
      <View style={s.grow}>
        <Body tone="secondary">
          Reconnecting… Prices will refresh before you can bid.
        </Body>
      </View>
    </View>
  );
}
export function Toast({
  children,
  tone = 'success',
  onClose,
}: {
  children: string;
  tone?: 'success' | 'error';
  onClose: () => void;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : CircleAlert;
  return (
    <View accessibilityLiveRegion="polite" style={s.banner}>
      <Icon
        size={20}
        strokeWidth={1.75}
        color={tone === 'success' ? colors['win-600'] : colors['outbid-600']}
      />
      <View style={s.grow}>
        <Body tone="secondary">{children}</Body>
      </View>
      <Pressable
        style={s.button}
        accessibilityRole="button"
        accessibilityLabel="Dismiss message"
        onPress={onClose}
      >
        <X size={20} strokeWidth={1.75} color={colors['indigo-900']} />
      </Pressable>
    </View>
  );
}
export function Header({ children }: { children?: ReactNode }) {
  return (
    <View style={s.header}>
      <Row>
        <Body tone="brand">Auction NG</Body>
      </Row>
      {children}
    </View>
  );
}
export function Footer() {
  return (
    <View style={s.footer}>
      <Body tone="brand">Auction NG</Body>
      <Body tone="secondary">
        Design review only. Sample amounts and statuses do not place bids or
        move money.
      </Body>
    </View>
  );
}
export function DesignSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <View style={s.section}>
      <Stack>
        <Body tone="section" accessibilityRole="header">
          {title}
        </Body>
        <Body tone="secondary">{description}</Body>
      </Stack>
      {children}
    </View>
  );
}
