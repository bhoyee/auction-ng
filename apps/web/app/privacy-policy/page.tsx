import { PolicyDocument } from '@auction-ng/ui/web/policy-document';
import { policyContent } from '../../lib/policy-content';
import { publicSupportEmail } from '../../lib/support';
export const metadata = {
  title: policyContent.privacy.title + ' | Auction NG',
};
export default function Page() {
  return (
    <PolicyDocument
      {...policyContent.privacy}
      supportEmail={publicSupportEmail()}
    />
  );
}
