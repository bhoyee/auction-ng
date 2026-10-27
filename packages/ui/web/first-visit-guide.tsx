import type { ReactNode } from 'react';

export function FirstVisitGuide({ images }: { images: ReactNode[] }) {
  return (
    <section
      className="agn-container agn-first-visit"
      aria-label="How Auction NG works"
    >
      <ol className="agn-first-visit-steps">
        {images.map((image, index) => (
          <li className="agn-step-card agn-step-card--image-only" key={index}>
            <div className="agn-step-artwork">{image}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
