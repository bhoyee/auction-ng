'use client';
import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Button } from './controls';
export function ProductPhoto({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState<string>();
  return (
    <div className="agn-buyer-photo">
      {src && failed !== src ? (
        <img
          src={src}
          alt={alt}
          width={960}
          height={960}
          decoding="async"
          onError={() => setFailed(src)}
        />
      ) : (
        <div className="agn-photo-pending">
          <ImageOff size={24} strokeWidth={1.75} aria-hidden="true" />
          <span>{src ? 'Photo could not be loaded' : 'Photo pending'}</span>
          {src && (
            <Button variant="ghost" onClick={() => setFailed(undefined)}>
              Retry photo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
