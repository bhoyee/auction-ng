import { useState } from 'react';
import { GuestMoreSheet } from '../../components/ui/guest-more';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useSession } from '../../lib/session';
import { useBuyerActivity } from '../../lib/buyer-activity';
import { GiddyTabBar } from '../../components/ui/tab-bar';
import { WinCelebration } from '../../components/ui/win-celebration';
export default function TabLayout() {
  const { counts } = useBuyerActivity();
  const [moreOpen, setMoreOpen] = useState(false);
  const { session } = useSession();
  const router = useRouter();
  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props: BottomTabBarProps) => (
          <GiddyTabBar
            {...props}
            signedIn={!!session}
            watching={counts?.watching}
          />
        )}
      >
        {[
          { name: 'index', title: 'Home' },
          { name: 'browse', title: 'Browse' },
          { name: 'watchlist', title: 'Watchlist' },
          { name: 'login', title: session ? 'Account' : 'Sign in' },
          { name: 'account', title: 'More' },
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
                : tab.name === 'account'
                  ? {
                      tabPress: (event: { preventDefault: () => void }) => {
                        event.preventDefault();
                        setMoreOpen(true);
                      },
                    }
                  : undefined
            }
            options={{ title: tab.title, tabBarAccessibilityLabel: tab.title }}
          />
        ))}
      </Tabs>
      <GuestMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <WinCelebration />
    </>
  );
}
