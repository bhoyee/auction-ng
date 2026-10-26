'use client';
import { BuyerPage, ErrorState } from '@auction-ng/ui/web';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <BuyerPage narrow title="Page unavailable">
      <ErrorState onRetry={reset}>
        Check your connection and try loading the page again.
      </ErrorState>
    </BuyerPage>
  );
}
