'use client';
import { useEffect, useState } from 'react';
import { MapPin, Pause, Play } from 'lucide-react';
import { formatNaira } from '@auction-ng/shared/money';
import { NairaText } from './auction';

export type WinSlide = {
  id: string;
  firstName: string;
  place: string;
  dateIso: string;
  category: string;
  title: string;
  image: string;
  retailKobo: number;
  winningKobo: number;
};

const dateLabel = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// Illustrative wins, labelled "Example" on every slide (owner-requested
// marketing content; no verified mark).
export function WinsSlider({ wins }: { wins: WinSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (paused || hover || focus || reduced || wins.length < 2) return;
    const timer = setInterval(
      () => setIndex((value) => (value + 1) % wins.length),
      5000,
    );
    return () => clearInterval(timer);
  }, [paused, hover, focus, reduced, wins.length]);
  if (!wins.length) return null;
  return (
    <section
      className="agn-wins"
      aria-roledescription="carousel"
      aria-label="Example wins"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
      }}
      onTouchStart={() => setPaused(true)}
    >
      <div className="agn-wins-track">
        {wins.map((win, position) => (
          <article
            key={win.id}
            className="agn-win-card"
            aria-roledescription="slide"
            aria-label={`${position + 1} of ${wins.length}`}
            hidden={position !== index}
          >
            <header className="agn-win-head">
              <span className="agn-win-avatar" aria-hidden="true">
                {win.firstName.charAt(0)}
              </span>
              <div className="agn-win-person">
                <strong>{win.firstName}</strong>
                <span>
                  <MapPin size={14} aria-hidden="true" />
                  {win.place} · {dateLabel.format(new Date(win.dateIso))}
                </span>
              </div>
              <span className="agn-win-label">Example</span>
            </header>
            <div className="agn-win-body">
              <div className="agn-win-photo">
                <img
                  src={win.image}
                  alt=""
                  width={160}
                  height={120}
                  loading="lazy"
                  decoding="async"
                />
                <span className="agn-win-saved">
                  Saved
                  <strong>
                    <NairaText
                      value={formatNaira(win.retailKobo - win.winningKobo)}
                    />
                  </strong>
                </span>
              </div>
              <div className="agn-win-item">
                <span className="agn-win-category">{win.category}</span>
                <h3>{win.title}</h3>
                <p className="agn-win-price">
                  <strong>
                    <NairaText value={formatNaira(win.winningKobo)} />
                  </strong>
                  <s>
                    <NairaText value={formatNaira(win.retailKobo)} />
                  </s>
                </p>
                <p className="agn-win-caption">Final winning bid</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="agn-wins-controls">
        {wins.map((win, position) => (
          <button
            key={win.id}
            type="button"
            className="agn-wins-dot"
            aria-label={`Show example ${position + 1}`}
            aria-current={position === index ? 'true' : undefined}
            onClick={() => {
              setIndex(position);
              setPaused(true);
            }}
          >
            <span />
          </button>
        ))}
        {/* Keyboard and screen-reader users can stop the slides (WCAG 2.2.2);
            hidden visually like the hero control. */}
        <button
          type="button"
          className="agn-wins-pause"
          onClick={() => setPaused((value) => !value)}
          disabled={reduced}
          aria-label={paused || reduced ? 'Play examples' : 'Pause examples'}
        >
          {paused || reduced ? <Play size={16} /> : <Pause size={16} />}
        </button>
      </div>
    </section>
  );
}
