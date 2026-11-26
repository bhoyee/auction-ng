'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Smartphone } from 'lucide-react';

export function PickupAppLink() {
  const [address, setAddress] = useState('/pickup/desk');
  useEffect(() => {
    setAddress(new URL('/pickup/desk', window.location.origin).href);
  }, []);
  return (
    <aside className="lv-pickup-app-entry" aria-label="Pickup app for phones">
      <Smartphone size={24} aria-hidden="true" />
      <div>
        <a href="/pickup/desk" target="_blank" rel="noopener noreferrer">
          Open Pickup app <ArrowUpRight size={18} aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <p>
          Open this link on a phone or tablet and add it to the home screen.
        </p>
        <a className="lv-pickup-app-address" href="/pickup/desk">
          {address}
        </a>
      </div>
    </aside>
  );
}
