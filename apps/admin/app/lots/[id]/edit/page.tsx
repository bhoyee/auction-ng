import { StaffWorkspace } from '../../../staff-workspace';
// Lots inventory routes render the same staff workspace, which opens Lots
// from the address.
export default function LotsPage() {
  return <StaffWorkspace />;
}
