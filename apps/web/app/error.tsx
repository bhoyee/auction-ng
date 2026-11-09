'use client';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { ErrorState } from '@auction-ng/ui/web/error-state';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <BuyerPage narrow title="Page unavailable">
      <ErrorState onRetry={reset}>
        Check your connection and try loading the page again.
      </ErrorState>
    </BuyerPage>
  );
}
