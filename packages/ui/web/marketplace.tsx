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
  ChevronDown,
  Tags,
  BadgePercent,
  Clock3,
  CircleHelp,
  BookOpen,
  MessagesSquare,
  Mail,
  RotateCcw,
  MessageCircle,
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
    <nav className="agn-category-strip" aria-label="Shop auctions">
      <div className="agn-container">
        <CategoryMenu categories={categories} />
        <div className="agn-shopping-links">
          <a href="/deals">
            <Tags size={18} aria-hidden="true" />
            All deals
          </a>
          <a href="/#top-deals">
            <BadgePercent size={18} aria-hidden="true" />
            Top deals
          </a>
          <a href="/ending-soon">
            <Clock3 size={18} aria-hidden="true" />
            Ending soon
          </a>
        </div>
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
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="agn-mega-menu">
        <a href="/categories">
          <Grid2X2 size={18} aria-hidden="true" />
          <span>Browse all categories</span>
        </a>
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
  search,
  actions,
  whatsappHref,
  signedIn = false,
}: {
  search: ReactNode;
  actions: ReactNode;
  whatsappHref?: string;
  signedIn?: boolean;
}) {
  return (
    <header
      className={`agn-market-header${signedIn ? ' agn-market-header--signed-in' : ''}`}
    >
      <div className="agn-container agn-market-header-inner">
        <a href="/" className="agn-wordmark" aria-label="Auction NG home">
          Auction<span>NG</span>
          <span className="agn-wordmark-dot" aria-hidden="true" />
        </a>
        {search}
        <div className="agn-header-support">
          <details className="agn-menu agn-help-menu">
            <summary aria-label="Help">
              <CircleHelp size={20} aria-hidden="true" />
              <span>Help</span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div className="agn-account-menu agn-help-links">
              <a href="/help">
                <BookOpen size={19} aria-hidden="true" />
                Help centre
              </a>
              <a href="/help#faqs">
                <MessagesSquare size={19} aria-hidden="true" />
                FAQs
              </a>
              <a href="/help#contact">
                <Mail size={19} aria-hidden="true" />
                Contact us
              </a>
              <a href="/help#returns">
                <RotateCcw size={19} aria-hidden="true" />
                Returns &amp; refunds
              </a>
            </div>
          </details>
          {whatsappHref ? (
            <a
              className="agn-whatsapp"
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat on WhatsApp"
            >
              <MessageCircle size={20} aria-hidden="true" />
              <span>WhatsApp</span>
            </a>
          ) : (
            <button
              className="agn-whatsapp"
              type="button"
              disabled
              aria-label="WhatsApp support not configured"
              title="WhatsApp support is not configured yet"
            >
              <MessageCircle size={20} aria-hidden="true" />
              <span>WhatsApp</span>
            </button>
          )}
        </div>
        <div className="agn-header-actions">{actions}</div>
      </div>
    </header>
  );
}
