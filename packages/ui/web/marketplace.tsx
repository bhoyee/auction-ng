'use client';
import { productImageSource } from './demo-image';
import { type ReactNode } from 'react';
import {
  Smartphone,
  Headphones,
  Laptop,
  CookingPot,
  Armchair,
  Shirt,
  Sparkles,
  Drill,
  Blocks,
  Dumbbell,
  BriefcaseBusiness,
  Grid2X2,
} from 'lucide-react';

export const categoryIcons = [
  Headphones,
  Smartphone,
  Laptop,
  CookingPot,
  CookingPot,
  Armchair,
  Shirt,
  Sparkles,
  Drill,
  Blocks,
  Dumbbell,
  BriefcaseBusiness,
];
function categoryIcon(name: string) {
  const lower = name.toLowerCase();
  const index = [
    'electronics',
    'phone',
    'computer',
    'appliance',
    'kitchen',
    'furniture',
    'fashion',
    'beauty',
    'tool',
    'children',
    'sport',
    'office',
  ].findIndex((part) => lower.includes(part));
  return categoryIcons[index] ?? Grid2X2;
}
export type MarketplaceCategory = {
  id: string;
  name: string;
  image?: string;
  count?: number;
};
export function CategoryStrip({
  categories,
}: {
  categories: MarketplaceCategory[];
}) {
  return (
    <nav className="agn-category-strip" aria-label="Shop categories">
      <div className="agn-container">
        <div className="agn-mobile-categories">
          <CategoryMenu categories={categories} />
        </div>
        {categories.map((category) => {
          const Icon = categoryIcon(category.name);
          return (
            <a key={category.id} href={`/categories/${category.id}`}>
              <Icon size={18} aria-hidden="true" />
              {category.name}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
export function CategoryMenu({
  categories,
}: {
  categories: MarketplaceCategory[];
}) {
  return (
    <details
      className="agn-menu agn-category-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary>
        <Grid2X2 size={19} aria-hidden="true" />
        All categories
      </summary>
      <div className="agn-mega-menu">
        {categories.map((category) => {
          const Icon = categoryIcon(category.name);
          return (
            <a
              key={category.id}
              href={`/categories/${category.id}`}
              onClick={(event) => {
                const details = event.currentTarget.closest('details');
                if (details) details.open = false;
              }}
            >
              {category.image && (
                <img
                  src={productImageSource(category.image)}
                  alt=""
                  width={64}
                  height={48}
                  loading="lazy"
                />
              )}
              <Icon size={18} aria-hidden="true" />
              <span>
                {category.name}
                {category.count !== undefined && (
                  <small>{category.count} open lots</small>
                )}
              </span>
            </a>
          );
        })}
      </div>
    </details>
  );
}
export function MarketplaceHeader({
  categories,
  search,
  actions,
}: {
  categories: MarketplaceCategory[];
  search: ReactNode;
  actions: ReactNode;
}) {
  return (
    <header className="agn-market-header">
      <div className="agn-container agn-market-header-inner">
        <a href="/" className="agn-wordmark" aria-label="Auction NG home">
          Auction<span>NG</span>
          <span className="agn-wordmark-dot" aria-hidden="true" />
        </a>
        <CategoryMenu categories={categories} />
        {search}
        <div className="agn-header-actions">{actions}</div>
      </div>
    </header>
  );
}
