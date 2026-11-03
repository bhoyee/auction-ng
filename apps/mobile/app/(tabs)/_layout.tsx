import { useState } from 'react';
import { GuestMoreSheet } from '../../components/ui/guest-more';
import { Tabs, useRouter } from 'expo-router';
import { Text } from 'react-native';
import {
  Home,
  Search,
  Heart,
  LogIn,
  Ellipsis,
  UserRound,
} from 'lucide-react-native';
import { tokens } from '@auction-ng/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../lib/session';
import { navigationStyles as s } from '../../components/ui/navigation-styles';
export default function TabLayout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const router = useRouter();
  const bottom = Math.max(insets.bottom, tokens.spacing.md);
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: tokens.colors['danfo-400'],
          tabBarInactiveTintColor: tokens.colors['indigo-50'],
          tabBarActiveBackgroundColor: tokens.colors['indigo-700'],
          tabBarItemStyle: s.item,
          tabBarStyle: [s.bar, { height: 64 + bottom, paddingBottom: bottom }],
          tabBarLabelStyle: s.label,
          tabBarIconStyle: s.icon,
          tabBarLabelPosition: 'below-icon',
          tabBarShowLabel: true,
        }}
      >
        {[
          { name: 'index', title: 'Home', icon: Home },
          { name: 'browse', title: 'Browse', icon: Search },
          { name: 'watchlist', title: 'Watchlist', icon: Heart },
          {
            name: 'login',
            title: session ? 'Account' : 'Login',
            icon: session ? UserRound : LogIn,
          },
          { name: 'account', title: 'More', icon: Ellipsis },
        ].map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            listeners={
              tab.name === 'login'
                ? {
                    tabPress: (event: { preventDefault: () => void }) => {
                      if (!session) {
                        event.preventDefault();
                        router.push('/sign-in');
                      }
                    },
                  }
                : tab.name === 'account' && !session
                  ? {
                      tabPress: (event: { preventDefault: () => void }) => {
                        event.preventDefault();
                        setMoreOpen(true);
                      },
                    }
                  : undefined
            }
            options={{
              title: tab.title,
              tabBarLabel: ({ color }: { color: string }) => (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={[s.label, { color }]}
                >
                  {tab.title}
                </Text>
              ),
              tabBarAccessibilityLabel: tab.title,
              tabBarIcon: ({
                color,
                size,
              }: {
                color: string;
                size: number;
              }) => <tab.icon color={color} size={size} />,
            }}
          />
        ))}
        <Tabs.Screen name="wallet" options={{ href: null }} />
      </Tabs>
      <GuestMoreSheet
        open={moreOpen && !session}
        onClose={() => setMoreOpen(false)}
      />
    </>
  );
}
