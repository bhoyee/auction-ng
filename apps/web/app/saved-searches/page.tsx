import { PrivateGate } from '../../components/private-gate';
import { SavedSearches } from '../../components/saved-searches';

export default function Page() {
  return (
    <PrivateGate title="Saved searches">
      <SavedSearches />
    </PrivateGate>
  );
}
