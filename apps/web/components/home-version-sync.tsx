'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { webVersionChanged } from '../lib/version-change';

export function HomeVersionSync({ version }: { version: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== '/' || version === 'development') return;
    let active = true;
    let pending = false;
    let reloading = false;
    const check = async () => {
      if (
        !active ||
        pending ||
        reloading ||
        document.hidden ||
        !navigator.onLine
      )
        return;
      pending = true;
      try {
        const response = await fetch('/api/web-version', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return;
        const result: unknown = await response.json();
        const available =
          result && typeof result === 'object' && 'version' in result
            ? result.version
            : undefined;
        if (
          active &&
          webVersionChanged(version, available) &&
          !document.activeElement?.matches(
            'input, textarea, select, [contenteditable="true"]',
          )
        ) {
          reloading = true;
          window.location.reload();
        }
      } catch {
        // Deployment checks must not interrupt offline auction browsing.
      } finally {
        pending = false;
      }
    };
    const update = () => {
      void check();
    };
    update();
    const timer = setInterval(update, 15000);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [pathname, version]);
  return null;
}
