'use client';
import {
  Baby,
  CookingPot,
  Laptop,
  Monitor,
  Shirt,
  Smartphone,
  Sofa,
  Tag,
  Wrench,
} from '@auction-ng/ui/web/icons';

const icons = {
  smartphone: Smartphone,
  laptop: Laptop,
  'cooking-pot': CookingPot,
  monitor: Monitor,
  shirt: Shirt,
  sofa: Sofa,
  baby: Baby,
  wrench: Wrench,
  tag: Tag,
} as const;

export const iconLabels: Record<keyof typeof icons, string> = {
  smartphone: 'Phone',
  laptop: 'Laptop',
  'cooking-pot': 'Kitchen',
  monitor: 'Screen',
  shirt: 'Clothing',
  sofa: 'Furniture',
  baby: 'Baby',
  wrench: 'Tools',
  tag: 'Tag',
};

export function CategoryIcon({
  name,
  size = 'small',
}: {
  name: string;
  size?: 'small' | 'large';
}) {
  const Icon = icons[name as keyof typeof icons] ?? Tag;
  return (
    <span className={`lv-setup-icon lv-setup-icon--${size}`} aria-hidden="true">
      <Icon size={size === 'large' ? 26 : 18} />
    </span>
  );
}
