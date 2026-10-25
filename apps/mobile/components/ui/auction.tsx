import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Pressable, Text, View } from 'react-native';
import { Bookmark, ImageOff } from 'lucide-react-native';
import { formatNaira, type databaseValues } from '@auction-ng/shared';
import { mobileTheme as t } from '@auction-ng/ui';
import { countdown } from '@auction-ng/ui/presentation';
import { Body, Button } from './controls';
import { styles as s, colors } from './styles';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: string;
  tone?: 'neutral' | 'brand' | 'win' | 'outbid';
}) {
  return (
    <View style={[s.badge, tone === 'brand' && s.badgeBrand]}>
      <Text
        numberOfLines={1}
        style={[
          s.text,
          s.fine,
          tone === 'brand' && s.brandText,
          tone === 'win' && s.successText,
          tone === 'outbid' && s.errorText,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
export function LivePill() {
  return (
    <View style={[s.badge, s.live]}>
      <Text style={[s.text, s.secondary, s.liveText]}>Live</Text>
    </View>
  );
}
export function Price({
  kobo,
  flash = true,
}: {
  kobo: number;
  flash?: boolean;
}) {
  const previous = useRef(kobo);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (previous.current === kobo) return;
    previous.current = kobo;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (flash)
      void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
        if (active && !reduce) {
          setChanged(true);
          timer = setTimeout(() => setChanged(false), t.motion.flash);
        }
      });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [kobo, flash]);
  return (
    <Text style={[s.text, s.price, changed && s.flash]}>
      {formatNaira(kobo)}
    </Text>
  );
}
export function Countdown({
  endsAt,
  serverNow,
  live = true,
}: {
  endsAt: number;
  serverNow: number;
  live?: boolean;
}) {
  const state = countdown(endsAt, serverNow);
  return (
    <View style={[s.countdown, live && state.urgent && s.urgent]}>
      <Text
        accessibilityLabel={
          live ? state.label : 'Reconnecting. Waiting for the latest price.'
        }
        style={[s.text, s.secondary, live && state.urgent && s.liveText]}
      >
        {live ? state.text : 'Reconnecting…'}
      </Text>
    </View>
  );
}
export function LotCard({
  title,
  reference,
  condition,
  priceKobo,
  retailKobo,
  endsAt,
  serverNow,
  live,
  watched,
  onWatch,
  onOpen,
  status,
  image,
}: {
  title: string;
  reference: string;
  condition: (typeof databaseValues.lotConditions)[number];
  priceKobo: number;
  retailKobo?: number;
  endsAt: number;
  serverNow: number;
  live: boolean;
  watched: boolean;
  onWatch: () => void;
  onOpen: () => void;
  status?: 'Winning' | 'Outbid' | 'Won';
  image?: { uri: string; alt: string };
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const label = condition.replaceAll('_', ' ');
  return (
    <View style={s.card}>
      <View style={s.photo}>
        {image && failedImage !== image.uri ? (
          <Image
            source={{ uri: image.uri }}
            accessibilityLabel={image.alt}
            style={s.image}
            resizeMode="cover"
            onError={() => setFailedImage(image.uri)}
          />
        ) : (
          <>
            <ImageOff
              size={24}
              strokeWidth={1.75}
              color={colors['slate-600']}
            />
            <Body tone="fine">Photo pending</Body>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${watched ? 'Unwatch' : 'Watch'} ${title}`}
          accessibilityState={{ selected: watched }}
          onPress={onWatch}
          style={s.watch}
        >
          <Bookmark
            size={20}
            strokeWidth={1.75}
            color={colors['indigo-900']}
            fill={watched ? colors['indigo-900'] : 'none'}
          />
        </Pressable>
        {status && (
          <View style={s.ribbon}>
            <Badge tone={status === 'Outbid' ? 'outbid' : 'win'}>
              {status}
            </Badge>
          </View>
        )}
      </View>
      <View style={s.cardBody}>
        <Body tone="fine">{reference}</Body>
        <Pressable
          style={s.titleTarget}
          accessibilityRole="button"
          onPress={onOpen}
        >
          <Text numberOfLines={2} style={[s.text, s.cardTitle]}>
            {title}
          </Text>
        </Pressable>
        <Badge>{label.charAt(0).toUpperCase() + label.slice(1)}</Badge>
        {live ? (
          <Price kobo={priceKobo} />
        ) : (
          <Body tone="secondary">Updating price…</Body>
        )}
        {retailKobo !== undefined && (
          <Text style={[s.text, s.fine]}>
            Retail <Text style={s.strike}>{formatNaira(retailKobo)}</Text>
          </Text>
        )}
        <Countdown endsAt={endsAt} serverNow={serverNow} live={live} />
        <Button fullWidth variant="secondary" disabled={!live} onPress={onOpen}>
          {live ? 'View lot' : 'Reconnecting…'}
        </Button>
      </View>
    </View>
  );
}
export function LotCardSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading lot" style={s.card}>
      <View style={[s.photo, { backgroundColor: colors.line }]} />
      <View style={s.cardBody}>
        <View style={s.skeleton} />
        <View style={s.skeleton} />
        <View style={[s.skeleton, s.skeletonPrice]} />
      </View>
    </View>
  );
}
