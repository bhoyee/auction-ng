'use client';
import { productImageSource } from './demo-image';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
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
export type PromoSlide = {
  title: string;
  description: string;
  action: string;
  href: string;
  image: ReactNode;
  tone?: 'yellow' | 'indigo';
};
export function PromoCarousel({ slides }: { slides: PromoSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [touch, setTouch] = useState<number>();
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (paused || hover || focus || reduced || slides.length < 2) return;
    const timer = setInterval(
      () => setIndex((value) => (value + 1) % slides.length),
      6000,
    );
    return () => clearInterval(timer);
  }, [paused, hover, focus, reduced, slides.length]);
  const select = (next: number) => {
    setPaused(true);
    setIndex((next + slides.length) % slides.length);
  };
  return (
    <section
      className="agn-promo-carousel"
      aria-label="Featured auctions"
      aria-roledescription="carousel"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
      }}
      onTouchStart={(event) => setTouch(event.changedTouches[0]?.clientX)}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (
          touch !== undefined &&
          end !== undefined &&
          Math.abs(end - touch) > 40
        )
          select(index + (end < touch ? 1 : -1));
        setTouch(undefined);
      }}
    >
      {slides.map((slide, position) => (
        <div
          key={slide.title}
          className={`agn-promo-slide agn-promo-slide--${slide.tone ?? 'indigo'}`}
          hidden={position !== index}
          role="group"
          aria-roledescription="slide"
          aria-label={`${position + 1} of ${slides.length}`}
        >
          <div className="agn-promo-copy">
            <span className="agn-promo-label">A better find, every day</span>
            <h1>{slide.title}</h1>
            <p>{slide.description}</p>
            <a href={slide.href} className="agn-button agn-promo-button">
              {slide.action}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
          <div className="agn-promo-image">{slide.image}</div>
        </div>
      ))}
      <div className="agn-carousel-controls">
        <div className="agn-carousel-dots">
          {slides.map((slide, position) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Show promotion ${position + 1}`}
              aria-pressed={position === index}
              onClick={() => select(position)}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          disabled={reduced}
          aria-label={
            reduced
              ? 'Automatic promotions paused for reduced motion'
              : paused
                ? 'Play promotions'
                : 'Pause promotions'
          }
        >
          {paused || reduced ? <Play size={17} /> : <Pause size={17} />}
        </button>
        <button
          type="button"
          aria-label="Previous promotion"
          onClick={() => select(index - 1)}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          aria-label="Next promotion"
          onClick={() => select(index + 1)}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}
