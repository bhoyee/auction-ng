import { useRouter } from 'expo-router';
import { useSession } from '../../lib/session';
import { ProfileScreen } from '../../screens/account';
import { Page } from '../../components/ui/page';
import { Button } from '../../components/ui/controls';
export default function LoginTab() {
  const { session } = useSession();
  const router = useRouter();
  return session ? (
    <ProfileScreen back={false} />
  ) : (
    <Page title="Sign in" back={false}>
      <Button onPress={() => router.push('/sign-in')}>
        Log in or create an account
      </Button>
    </Page>
  );
}
