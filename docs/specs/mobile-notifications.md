# Mobile badges and Android phone notifications

The mobile app reads active Watching counts and unread notification/pickup counts centrally. Counts refresh immediately after confirmed local watch/unwatch, notification-read, bid and purchase changes; outbid/push events and foreground/reconnect also refresh them. A single five-second fallback refresh runs while online and foregrounded. Counts are isolated per signed-in buyer; old-session responses cannot update the next buyer. Empty counts have no red badge. Watching counts exclude Won/Lost history according to the existing API.

## Android push setup still required

At the 2026-11-04 check, the owner confirmed Firebase/FCM is not configured. The local API has EXPO_PUSH_ENABLED=false. In-app badges do not require either setting. Physical phone push delivery has not been verified.

1. In Firebase Console, create/select the LotVanta project and add an Android app with package name `ng.auction.app` (retain this existing identifier).
2. Download that Android app's `google-services.json`. This identifies the Firebase app; it is not the FCM service-account private key.
3. In the existing Expo/EAS LotVanta project, add a **file** environment variable named `GOOGLE_SERVICES_JSON` to the **development** environment, uploading that google-services.json. Repeat for preview/production when those builds are configured. app.config.ts reads this file variable as android.googleServicesFile.
4. Configure the FCM V1 service-account credential for the existing EAS Android app. From PowerShell:

   ```powershell
   cd C:\Users\bhoyee-pc\Desktop\auction-ng\apps\mobile
   eas credentials --platform android
   ```

   Select the development profile and the Google Service Account / FCM V1 push credential option. Upload the Firebase service-account key through EAS. Keep that private key outside the repository; never put it in EXPO_PUBLIC variables or chat.

5. Rebuild and install the APK, retaining existing signing credentials:

   ```powershell
   eas build --platform android --profile development
   ```

6. Once credentials/build are ready, enable EXPO_PUSH_ENABLED on the API service. If enhanced Expo push security is enabled, configure its server-only EXPO_PUSH_ACCESS_TOKEN too. Existing notification worker calls deliver through the API; no direct worker token is needed. Apply only the API environment update, preserving demo/database/Redis identity and unrelated configuration.
7. On the phone, sign in and use Account > App preferences > Enable phone push alerts (also available through More > App settings). Allow Android notification permission. Registration is bound to the current mobile session and consent is stored per buyer. Previously opted-in accounts re-register on foreground/session restoration; no permission prompt is shown automatically.
8. Verify a legitimate new notification reaches the phone, updates the bell badge, and opens the signed-in notification inbox on tap. Log out and confirm no subsequent notifications are sent for the revoked session. Do not claim this passed from a bundle or provider ticket alone.

Foreground and notification-tap listeners refresh account summaries, and supported launchers receive the unread badge count. Expo Go is skipped for remote push. Phone permissions, battery restrictions and a valid installed Firebase-enabled native build still apply.

Official setup: https://docs.expo.dev/push-notifications/push-notifications-setup/ and https://docs.expo.dev/push-notifications/fcm-credentials/
