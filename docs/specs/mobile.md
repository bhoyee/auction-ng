# T14 mobile app (in progress)

The existing `apps/mobile` app uses the same buyer APIs, shared money rules and authentication contracts as the website. The app name is LotVanta; its existing Expo project is `@binsalith/lotvanta`, project ID `c7cb2c0d-fa52-46ec-8b08-d51cdd25ac63`. Do not generate another app to initialise EAS.

## Local testing and production

For local phone connectivity, run `pnpm mobile:connect` at the repository root after Docker Desktop is ready. It preserves the existing demo environment, starts the local services, binds only the buyer website/API/realtime ports to the selected private LAN IPv4 and keeps the PC's loopback ports. It does not expose PostgreSQL, Redis, search or the staff dashboard to the LAN. Then run `pnpm mobile:check` and restart Expo with `pnpm --filter mobile start --clear --port 8081`.

The setup writes only public service origins to ignored `.env.mobile.local`. The Expo launcher reads that file only for development starts; release exports ignore it. An explicit shell setting still takes precedence. If Wi-Fi changes, run the connection setup again and restart Expo. Set optional `MOBILE_BIND_ADDRESS` only to a private IPv4 actually assigned to the PC when automatic Wi-Fi detection is ambiguous. The phone must share that trusted network; a successful PC-side check alone does not prove phone/firewall reachability. Never disable Windows Firewall to make this work.

The base Compose configuration stays loopback-only. `infra/docker/mobile.compose.yml` is a development override used by the connection command, not a production deployment file. Compose must support `!override` (2.24.4 or newer). An unexpected Redis restart may deliberately pause fresh bid snapshots even when all network checks connect; [review the recovery proposal](bid-engine-recovery-proposal.md) rather than resetting its runtime marker.

Local Android development connects to Docker through the computer's LAN address. `localhost` on a physical phone means that phone, not the computer. The phone and computer must share a network, and Windows Firewall must allow the development ports on the private network.

A production build connects to public HTTPS API and realtime origins. It must never use a development HTTP origin. `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_REALTIME_URL` and `EXPO_PUBLIC_WEB_URL` contain public addresses only. Payment, SMTP, encryption and Expo server access secrets remain on the backend. The launcher copies only its allowlisted public variables from the local environment.

A local development APK and a production store build share the source code; they use separate build settings. The owner approved the local/production arrangement on 2026-11-02, including `expo-dev-client@58.0.14`. Public production service addresses have not been supplied. Release profiles stop during configuration if any service origin is missing, uses HTTP, contains credentials or points to a loopback/private IPv4 address.

### Android development setup (PowerShell)

1. Install Node.js 22 and Docker Desktop, and start Docker Desktop. Use the existing repository and its pnpm setup; do not run create-expo-app again.
2. In PowerShell at the repository root, run `pnpm install`. Start the configured local application services. Confirm the buyer website opens at `http://localhost:3300` and the API health endpoint responds at `http://localhost:4000/health` before testing the phone.
3. Build the development APK once, using the existing EAS account/project:

   ```powershell
   Set-Location apps/mobile
   eas build --platform android --profile development
   ```

   EAS returns a build/install link when the build succeeds. Open that link on the Android phone and install the APK. This has not yet been verified on a real phone. Any signing setup is managed through the account's EAS credentials prompts; never paste credentials into chat or commit them.

4. Return to the repository root and start Metro:

   ```powershell
   Set-Location ../..
   pnpm --filter mobile start:dev
   ```

   Keep PowerShell open. Connect the phone to the same Wi-Fi as the computer. Open LotVanta and scan the development-server QR code. The app normally derives the Docker API/realtime host from Metro's LAN address. If explicit EXPO_PUBLIC service values are set, they must use the computer's LAN IP, not localhost on the phone. Only allow development ports through Windows Firewall on a trusted private network.

5. JavaScript changes reload without rebuilding the APK. Native dependency or app-configuration changes may require a new development APK.

For Expo Go, run `pnpm --filter mobile start` (or `pnpm --filter mobile start:go`). Both explicitly select Expo Go, so installing the development-client dependency does not switch the QR code to a different application. Use `pnpm --filter mobile start:dev` only with the installed LotVanta development APK. Stop the previous Metro session with Ctrl+C before switching launch targets. Keep Expo Go compatible with SDK 58. Remote push must be tested in an installed build with FCM/APNs credentials; Expo Go does not verify this acceptance item.

### Release builds

Configure `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_REALTIME_URL` and `EXPO_PUBLIC_WEB_URL` in the corresponding EAS `preview` or `production` environment with the actual public HTTPS origins. These addresses are public configuration, not secret keys. Then run the appropriate command inside `apps/mobile`:

```powershell
eas build --platform android --profile preview
eas build --platform android --profile production
```

Preview creates an internally distributed standalone APK. Production uses the store build profile. Neither requires Metro running on the developer's computer. Builds do not publish the app to a store automatically. Follow [Expo's build-profile documentation](https://docs.expo.dev/build/eas-json/) for the distinction between development and release builds.

## Current implementation

- Current SDK compatibility pins are Expo `58.0.22`, React Native/Metro `0.88.1` and the matching recommended patches for existing native packages. The owner approved this SDK 58 patch alignment on 2026-11-02. `expo install --check` passes; mobile React stays `19.3.0`, while web/admin keep their separate `19.2.0` dependency.
- Native home, catalogue, upcoming lots and item-detail routes, cached images and a data-saver preference.
- Password/email-code login, signup and recovery; optional buyer authenticator factors and local QR rendering. Refresh credentials use SecureStore; access credentials stay in memory.
- Buyer watchlist, bid history, orders, invoices, collection passes, profile and support screens.
- Wallet funding, withdrawal and Buy Now screens use existing typed APIs. Saved uncertain requests retain their idempotency keys. Buy Now retry reviews show the saved payment method and amounts even when the current price changes.
- A shared socket connection and foreground polling refresh data. Countdown time comes from the server clock.
- Native push registration and an encrypted device/delivery outbox use additive migration `20261102000200_native_push_devices`. Enable only after deployment and Expo credentials are configured. Push payloads contain a generic alert and a notifications route, not private bidding or wallet information.

## Verification and remaining acceptance

Home/launch redesign (2026-11-02): replaced the initial home layout with a compact wordmark/search header, photographic promotion, auction shortcuts, fresh-price product sections and responsive tablet grids. Added the approved native splash plugin and token-generated wordmark; no artificial startup delay. Seven targeted price-presentation tests cover fresh/no-bid and stale-snapshot states. [Android visual review](../design/mobile-home/README.md) uses isolated sample data while Docker is unavailable. Expo Go still owns its initial native launcher; the configured release splash needs an installed-build review.

On 2026-11-02, targeted mobile lint and type checks passed. Twenty-one focused build-endpoint/session/payment-review tests passed. Expo public configuration resolves with the installed development client and linked project. Android and iOS bundle exports passed with the development-client dependency and current QR/payment-review fixes. Earlier native-push integration tests passed against an isolated database. These checks do not establish that a signed APK installs or meets the real-device performance budget.

After the approved SDK patch alignment, Expo compatibility, mobile types, affected-file lint, the 21 focused native tests and Android/iOS exports passed again. The restarted Expo Go server returned HTTP 200 with the LotVanta SDK 58 manifest. Physical-phone launch confirmation remains outstanding.

The Android emulator rendered the app, but system ANR dialogs and Docker Desktop internal errors blocked reliable end-to-end review. This is not evidence of completed phone acceptance. Outstanding work includes full feature-parity review, push lifecycle/FCM configuration, screenshots at the required sizes, the Maestro signup/bid/win flow, a real-phone EAS install and the measured cold-start budget. T14 must remain in progress until these pass.

MONEY/BID CHANGE - needs human review. Native screens call existing operations; payment-review changes require review alongside the server safeguards.
