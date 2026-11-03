import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { Body } from './controls';
import { detailStyles as s } from './lot-detail-styles';

export function LotGallery({
  urls,
  onEnlarge,
}: {
  urls: string[];
  onEnlarge: (url: string) => void;
}) {
  const rail = useRef<ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const count = urls.length;
  useEffect(() => {
    if (index >= count) setIndex(0);
    rail.current?.scrollTo({
      x: width * Math.min(index, Math.max(0, count - 1)),
      animated: false,
    });
  }, [width, index, count]);
  if (!count) return <Body>No item photos available.</Body>;
  return (
    <View
      style={s.gallery}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={rail}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          if (width)
            setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
      >
        {urls.map((url, position) => (
          <Pressable
            key={`${position}-${url}`}
            style={{ width }}
            accessibilityRole="button"
            accessibilityLabel={`Enlarge item photo ${position + 1} of ${count}`}
            onPress={() => onEnlarge(url)}
          >
            {Math.abs(position - index) <= 1 && (
              <Image
                source={url}
                style={s.photo}
                contentFit="contain"
                cachePolicy="memory-disk"
                accessibilityLabel={`Item photo ${position + 1}`}
              />
            )}
          </Pressable>
        ))}
      </ScrollView>
      {count > 1 && (
        <View style={s.controls}>
          <Pressable
            style={s.control}
            accessibilityRole="button"
            accessibilityLabel="Previous photo"
            accessibilityState={{ disabled: index === 0 }}
            disabled={index === 0}
            onPress={() => setIndex(index - 1)}
          >
            <ChevronLeft color={t.colors['indigo-900']} />
          </Pressable>
          <Body style={s.copy}>
            {index + 1} / {count} · Swipe photos
          </Body>
          <Pressable
            style={s.control}
            accessibilityRole="button"
            accessibilityLabel="Next photo"
            accessibilityState={{ disabled: index >= count - 1 }}
            disabled={index >= count - 1}
            onPress={() => setIndex(index + 1)}
          >
            <ChevronRight color={t.colors['indigo-900']} />
          </Pressable>
        </View>
      )}
    </View>
  );
}
