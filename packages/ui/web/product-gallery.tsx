'use client';
import { productImageSource } from './demo-image';
import { Button } from './controls';
import { Dialog } from './feedback';
import { useState } from 'react';

export function ProductGallery({
  images,
  title,
}: {
  images: { url: string; thumbnailUrl: string }[];
  title: string;
}) {
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const image = images[selected];
  return (
    <div className="agn-product-gallery">
      <button
        type="button"
        className="agn-gallery-main"
        onClick={() => setZoom(true)}
        aria-label={`Enlarge photo of ${title}`}
        disabled={!image || failed}
      >
        {image ? (
          <img
            key={`${selected}-${attempt}`}
            src={productImageSource(image.url)}
            alt={title}
            width={960}
            height={720}
            fetchPriority="high"
            onError={() => setFailed(true)}
          />
        ) : (
          <span>Photo pending</span>
        )}
        <span className="agn-gallery-zoom-label">View larger</span>
      </button>
      {failed && (
        <div role="alert">
          <p>
            This photo could not be loaded. Check your connection and try again.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            Reload photo
          </Button>
        </div>
      )}
      <div className="agn-gallery-thumbnails" aria-label="Product photos">
        {images.map((item, index) => (
          <button
            type="button"
            key={item.url}
            aria-label={`Photo ${index + 1}`}
            aria-pressed={selected === index}
            onClick={() => {
              setSelected(index);
              setFailed(false);
            }}
          >
            <img
              src={productImageSource(item.thumbnailUrl)}
              alt=""
              width={80}
              height={60}
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <Dialog title={title} open={zoom} onClose={() => setZoom(false)}>
        {image && (
          <img
            className="agn-gallery-zoom-image"
            src={productImageSource(image.url)}
            alt={title}
            width={960}
            height={720}
          />
        )}
      </Dialog>
    </div>
  );
}
