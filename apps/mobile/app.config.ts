import type { ExpoConfig, ConfigContext } from 'expo/config';
import { validateBuildEndpoints } from './lib/build-endpoints.cjs';
import launchTheme from './assets/launch-theme.json';
export default ({ config }: ConfigContext): ExpoConfig => {
  validateBuildEndpoints(process.env.EAS_BUILD_PROFILE, process.env);
  return {
    ...config,
    name: 'LotVanta',
    slug: 'lotvanta',
    owner: 'binsalith',
    scheme: ['lotvanta', 'auction-ng'],
    icon: './assets/lotvanta-icon.png',
    backgroundColor: launchTheme.backgroundColor,
    plugins: [
      'expo-router',
      'expo-font',
      'expo-secure-store',
      'expo-notifications',
      'expo-image-picker',
      [
        'expo-splash-screen',
        {
          ...launchTheme,
          image: './assets/launch-icon.png',
          imageWidth: 160,
          resizeMode: 'contain',
        },
      ],
    ],
    ios: { ...config.ios, bundleIdentifier: 'ng.auction.app' },
    android: {
      ...config.android,
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
      package: 'ng.auction.app',
      softwareKeyboardLayoutMode: 'resize',
    },
    extra: {
      ...config.extra,
      eas: {
        projectId:
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          'c7cb2c0d-fa52-46ec-8b08-d51cdd25ac63',
      },
    },
  };
};
