'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function StickyMarketplaceHeader({ children }: { children: ReactNode }) {
  const header = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const update = () => setCompact(window.scrollY > 240);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  useEffect(() => {
    const element = header.current;
    if (!element || compact) return;
    const update = () => setHeight(element.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact]);
  // Reserve the expanded height: collapsing must not move the page or make
  // scroll anchoring repeatedly cross the collapse threshold.
  return (
    <div
      className="agn-header-region"
      style={compact && height ? { height } : undefined}
    >
      <div
        ref={header}
        className={`agn-header-stack${compact ? ' agn-header-stack--compact' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}
