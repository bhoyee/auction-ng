'use client';
import { useCallback, useState } from 'react';
import { Button } from '@auction-ng/ui/web/button';

export const SETUP_PAGE_SIZE = 25;

// Page-by-page browsing over a keyset (cursor) list: remembers the cursor of
// every page visited so Previous goes back exactly.
export function useKeysetPager() {
  const [stack, setStack] = useState<(string | undefined)[]>([undefined]);
  return {
    cursor: stack[stack.length - 1],
    page: stack.length,
    next: useCallback(
      (cursor: string) => setStack((current) => [...current, cursor]),
      [],
    ),
    prev: useCallback(
      () =>
        setStack((current) =>
          current.length > 1 ? current.slice(0, -1) : current,
        ),
      [],
    ),
    reset: useCallback(() => setStack([undefined]), []),
  };
}

export function SetupPager({
  page,
  count,
  nextCursor,
  onPrev,
  onNext,
  label,
}: {
  page: number;
  count: number;
  nextCursor: string | null | undefined;
  onPrev: () => void;
  onNext: (cursor: string) => void;
  label: string;
}) {
  if (page === 1 && !nextCursor) return null;
  const first = (page - 1) * SETUP_PAGE_SIZE + 1;
  return (
    <nav className="lv-setup-pager" aria-label={`${label} pages`}>
      <span>
        Showing{' '}
        {count
          ? `${first.toLocaleString('en-NG')}–${(first + count - 1).toLocaleString('en-NG')}`
          : 'none'}{' '}
        · page {page}
      </span>
      <span className="lv-setup-pager-buttons">
        <Button
          variant="secondary"
          size="small"
          disabled={page === 1}
          onClick={onPrev}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="small"
          disabled={!nextCursor}
          onClick={() => nextCursor && onNext(nextCursor)}
        >
          Next
        </Button>
      </span>
    </nav>
  );
}
