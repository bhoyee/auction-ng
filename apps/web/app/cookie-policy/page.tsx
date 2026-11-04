import { PolicyDocument } from '@auction-ng/ui/web/policy-document';
import { policyContent } from '../../lib/policy-content';
import { publicSupportEmail } from '../../lib/support';
export const metadata = {
  title: policyContent.cookies.title + ' | LotVanta',
};
export default function Page() {
  return (
    <PolicyDocument
      {...policyContent.cookies}
      supportEmail={publicSupportEmail()}
    />
  );
}
