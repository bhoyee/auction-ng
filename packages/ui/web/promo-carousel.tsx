'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from 'lucide-react';
export type PromoSlide = {
  eyebrow?: string;
  title: string;
  description: string;
  priceLine?: string;
  action: string;
  href: string;
  image: ReactNode;
  tone?: 'yellow' | 'indigo' | 'light';
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
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        select(index + (event.key === 'ArrowRight' ? 1 : -1));
      }}
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
            <span className="agn-promo-label">
              {slide.eyebrow ?? 'A better find, every day'}
            </span>
            <h1>{slide.title}</h1>
            <p className="agn-promo-description">{slide.description}</p>
            {slide.priceLine && (
              <p className="agn-promo-start">{slide.priceLine}</p>
            )}
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
