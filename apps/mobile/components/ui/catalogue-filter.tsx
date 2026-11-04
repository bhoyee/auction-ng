import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import {
  databaseValues,
  dealEndBands,
  type DealFilters,
} from '@auction-ng/shared';
import { Body, Button, Dialog } from './controls';
import { n } from './native-styles';
import { colors } from './styles';
export function CatalogueFilter({
  value,
  onChange,
  categories,
}: {
  value: DealFilters;
  onChange: (value: DealFilters) => void;
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const toggle = <T extends string>(items: readonly T[], item: T) =>
    items.includes(item) ? items.filter((v) => v !== item) : [...items, item];
  return (
    <>
      <Button variant="secondary" size="small" onPress={() => setOpen(true)}>
        Filter auctions
      </Button>
      <Dialog
        open={open}
        title="Filter auctions"
        presentation="sheet"
        onClose={() => setOpen(false)}
      >
        <View style={n.content}>
          <Body tone="section">Category</Body>
          <Pressable
            style={n.link}
            accessibilityRole="radio"
            accessibilityState={{ checked: !value.categoryId }}
            onPress={() => onChange({ ...value, categoryId: undefined })}
          >
            <Body>All categories</Body>
            {!value.categoryId && <Check color={colors['win-600']} />}
          </Pressable>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              style={n.link}
              accessibilityRole="radio"
              accessibilityState={{ checked: value.categoryId === category.id }}
              onPress={() => onChange({ ...value, categoryId: category.id })}
            >
              <Body>{category.name}</Body>
              {value.categoryId === category.id && (
                <Check color={colors['win-600']} />
              )}
            </Pressable>
          ))}
          <Body tone="section">Current bid</Body>
          {[
            { id: 'under-30000', label: 'Under NGN 30,000' },
            { id: 'under-100000', label: 'Under NGN 100,000' },
            { id: '100000-plus', label: 'NGN 100,000 and above' },
          ].map((band) => (
            <Pressable
              key={band.id}
              style={n.link}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: value.prices.includes(
                  band.id as DealFilters['prices'][number],
                ),
              }}
              onPress={() =>
                onChange({
                  ...value,
                  prices: toggle(
                    value.prices,
                    band.id as DealFilters['prices'][number],
                  ),
                })
              }
            >
              <Body>{band.label}</Body>
              {value.prices.includes(
                band.id as DealFilters['prices'][number],
              ) && <Check color={colors['win-600']} />}
            </Pressable>
          ))}
          <Body tone="section">Auction ends</Body>
          {dealEndBands.map((band) => (
            <Pressable
              key={band.id}
              style={n.link}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: value.ends.includes(band.id) }}
              onPress={() =>
                onChange({ ...value, ends: toggle(value.ends, band.id) })
              }
            >
              <Body>{band.label}</Body>
              {value.ends.includes(band.id) && (
                <Check color={colors['win-600']} />
              )}
            </Pressable>
          ))}
          <Body tone="section">Condition</Body>
          {databaseValues.lotConditions.map((condition) => (
            <Pressable
              key={condition}
              style={n.link}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: value.conditions.includes(condition),
              }}
              onPress={() =>
                onChange({
                  ...value,
                  conditions: toggle(value.conditions, condition),
                })
              }
            >
              <Body>{condition.replaceAll('_', ' ')}</Body>
              {value.conditions.includes(condition) && (
                <Check color={colors['win-600']} />
              )}
            </Pressable>
          ))}
          <Button
            variant="danger"
            onPress={() =>
              onChange({
                ...value,
                prices: [],
                ends: [],
                conditions: [...databaseValues.lotConditions],
                categoryId: undefined,
              })
            }
          >
            Clear filters
          </Button>
          <Button onPress={() => setOpen(false)}>Done</Button>
        </View>
      </Dialog>
    </>
  );
}
