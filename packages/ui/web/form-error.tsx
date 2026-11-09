'use client';
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
export function FormError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    banner.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [message]);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(onDismiss, 10000);
    return () => clearTimeout(timer);
  }, [paused, onDismiss, message]);
  return (
    <div
      ref={banner}
      className="agn-form-error"
      role="alert"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <CircleAlert size={20} aria-hidden="true" />
      <p>{message}</p>
      <button type="button" aria-label="Dismiss error" onClick={onDismiss}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
