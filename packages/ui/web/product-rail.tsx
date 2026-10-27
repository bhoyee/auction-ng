'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ProductRail({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () =>
      setEdges({
        start: element.scrollLeft < 2,
        end:
          element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
      });
    update();
    element.addEventListener('scroll', update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      resize.disconnect();
    };
  }, []);
  const move = (direction: number) => {
    const element = viewport.current;
    if (element)
      element.scrollBy({
        left: direction * element.clientWidth * 0.85,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
  };
  return (
    <div className="agn-product-rail">
      {!(edges.start && edges.end) && (
        <div className="agn-rail-controls" aria-label={`${label} controls`}>
          <button
            type="button"
            aria-label={`Previous ${label}`}
            disabled={edges.start}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label={`Next ${label}`}
            disabled={edges.end}
            onClick={() => move(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
      <div
        className="agn-rail-viewport"
        ref={viewport}
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
