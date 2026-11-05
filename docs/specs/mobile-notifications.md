# Mobile badges and Android phone notifications

The mobile app reads active Watching counts and unread notification/pickup counts centrally. Counts refresh immediately after confirmed local watch/unwatch, notification-read, bid and purchase changes; outbid/push events and foreground/reconnect also refresh them. A single five-second fallback refresh runs while online and foregrounded. Counts are isolated per signed-in buyer; old-session responses cannot update the next buyer. Empty counts have no red badge. Watching counts exclude Won/Lost history according to the existing API.

## Android push setup

The owner has since uploaded the FCM V1 service-account credential to EAS. On 2026-11-05, local API registration was still blocked because EXPO_PUSH_ENABLED was unset in both private environment files and false in the running container. Enabled the flag in .env and .env.demo and recreated only API, preserving current source/compiled/shared code, all other environment values, database/Redis identity and loopback/phone LAN bindings. Both health addresses pass. No access token is configured locally; an Expo access token remains necessary only if enhanced push security is enabled for this project. Physical phone delivery has not been verified.

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
7. On the phone, sign in and use Account > App preferences > Enable phone push alerts (also available through More > App settings). Allow Android notification permission. Registration is bound to the current mobile session and consent is stored per buyer. Previously opted-in accounts re-register on foreground/session restoration and token rotation. Owner-approved first-launch permission onboarding now runs after the launch screen, as described below.
8. Verify a legitimate new notification reaches the phone, updates the bell badge, and opens the signed-in notification inbox on tap. Log out and confirm no subsequent notifications are sent for the revoked session. Do not claim this passed from a bundle or provider ticket alone.

Foreground and notification-tap listeners refresh account summaries, and supported launchers receive the unread badge count. Expo Go is skipped for remote push. Phone permissions, battery restrictions and a valid installed Firebase-enabled native build still apply.

Official setup: https://docs.expo.dev/push-notifications/push-notifications-setup/ and https://docs.expo.dev/push-notifications/fcm-credentials/


## Local activation verification (2026-11-05)

Four isolated push integration tests pass, including a new real-provider registration gate regression: disabled returns 503, enabled accepts a valid active mobile session without making a provider call. Existing tests cover token encryption, concurrent delivery deduplication, revoked sessions and no replay of old shared-phone notifications. Changed-test lint and API types pass. Runtime reports push enabled and zero registered enabled devices at the check; the buyer must retry Enable phone push alerts. No actual phone alert was sent during validation. Local opt-in, delivery/receipt and notification-tap verification remain pending.


## First-launch permission (2026-11-05, owner requested)

The installed app requests native notification permission once after its launch overlay finishes. Android creates its auction-updates channel before requesting permission/token registration. Expo Go/web are excluded. A persisted device-level prompt marker prevents repeated automatic requests, including after denial/dismissal; existing permissions are respected and manual App preferences/settings recovery remains available.

Granted permission records local device consent. On sign-in, accounts without a saved choice automatically register through the existing authenticated endpoint; an explicit account opt-out remains authoritative. Server success is required before saving a new account opt-in. Registration is owner-fenced and repeats on token rotation so revoked originating sessions do not strand notifications. No anonymous push token registration, tokens in logs or changes to notification payloads/endpoints.

Eight targeted onboarding tests (grant/deny/already granted/no-repeat/concurrent calls/explicit opt-out), changed-source lint, mobile types and Android bundle pass. The owner confirmed manual phone registration enabled before this change. First-install native permission appearance and real delivery/tap screenshots remain pending; existing granted users will not see the OS dialog again. A standalone release needs an APK containing these JavaScript changes; the development client can reload Metro. Official permission behaviour: https://docs.expo.dev/versions/latest/sdk/notifications/#permissions
