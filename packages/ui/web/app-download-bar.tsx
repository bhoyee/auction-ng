'use client';
import { X } from 'lucide-react';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from './store-links';

/** Phone-only strip above the header that links to the app store. */
export function AppDownloadBar({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside className="agn-app-bar" aria-label="Get the app">
      <img
        src="/img/gd-mark-96.webp"
        alt=""
        width={40}
        height={40}
        loading="lazy"
        fetchPriority="low"
      />
      <p>Get the app. Bid from your phone.</p>
      <a
        href={GOOGLE_PLAY_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          if (/iPhone|iPad|iPod/.test(navigator.userAgent))
            event.currentTarget.href = APP_STORE_URL;
        }}
      >
        Download
      </a>
      <button type="button" aria-label="Hide app message" onClick={onDismiss}>
        <X size={20} aria-hidden="true" />
      </button>
    </aside>
  );
}
