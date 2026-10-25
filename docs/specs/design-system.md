# D01 design system

The shared system implements DESIGN.md with Schibsted Grotesk, adire indigo actions, flat bordered surfaces and yellow restricted to live/closing states. Product screens remain T13/T14/T15. On 2026-10-25 the owner approved progression to T13 after visual review was requested.

## Files and boundaries

- `packages/ui/tokens.ts`: platform-neutral colour, typography, spacing, radius, floating shadow, motion and layout tokens; the mobile theme reduces the two largest type sizes by 2 px.
- `packages/ui/theme.css`: generated Tailwind theme. Run `pnpm tokens:generate` after editing tokens.
- `packages/ui/web`: shared buttons, fields, OTP and Naira inputs, selects, badges, live pill, prices, countdowns, lot cards/skeletons, dialogs/sheets, tabs, toast, empty/error/offline feedback, header and footer. Import components from `@auction-ng/ui/web` and styles from `@auction-ng/ui/styles.css`.
- `apps/mobile/components/ui`: native equivalents built with React Native primitives and shared tokens, with Lucide icons and Expo-compatible SVG rendering.
- `packages/ui/presentation.ts`: platform-neutral amount-entry parsing and countdown formatting. This file has no React dependency. Fee rules, money formatting and persisted condition enums remain in `packages/shared`.
- `apps/web/app/design`: development-only component review at `/design`; production returns 404.
- `apps/mobile/app/design.tsx`: hidden development route; release builds redirect to the placeholder home.

The package root remains tokens only. Mobile imports do not traverse web components or their React runtime. Web/admin keep React 19.2.0 and Expo keeps React 19.3.0. The owner approved lucide-react 1.61.0, lucide-react-native 1.61.0 and react-native-svg 15.16.0. No UI framework was added.

## Interaction contracts

- Native/web touch targets are at least 44 px. Web controls show keyboard focus; tabs support arrows/Home/End. Native fields have labels and screen-reader hints.
- Web dialogs use the native modal dialog, a bounded focus loop, Escape dismissal and browser focus restoration. Native dialogs use Modal with Android back dismissal and an initial screen-reader focus target.
- Countdown callers supply an authoritative server-offset time. The components do not start a competing client clock. Reconnecting lot cards hide the price and disable the action until their caller supplies fresh state.
- Price flashes last 300 ms and respect reduced motion. No mount/scroll animation or shimmering skeleton is used.
- Amount entry accepts a decimal string with at most two places, returns safe integer kobo or undefined, and never rounds invalid precision. Final validation, estimated totals, funding and acceptance belong to existing shared/server contracts.
- Lot cards use staff-supplied photos with a photo-pending fallback on missing/failed images. The preview uses honest photo-pending examples because the seed has no real product photographs.
- Preview clocks, amounts, statuses and notifications are explicitly illustrative. Actions never reach payment/bid endpoints or change wallet funds.

## Open the previews in PowerShell

From the repository folder, with the pinned Node 22 and pnpm installed:

```powershell
pnpm install
pnpm --filter web exec next dev --port 3310
```

Leave that window open and visit `http://localhost:3310/design`. Ports 3000/3001 remain unused by these checks. The production Docker buyer site on 3300 intentionally does not expose the design route.

In another PowerShell window:

```powershell
pnpm --filter mobile start
```

Open the QR code in Expo Go on an Android phone on the same Wi-Fi. Enter the development path by opening the Metro URL with `/--/design` appended (for example `exp://192.168.1.10:8081/--/design`). Use the actual IP/port printed by Expo. If a port is occupied, use `pnpm --filter mobile exec expo start --lan --port 0` to select a free one. This preview is not linked in buyer navigation.

For an Android emulator, use the LAN server or adb reverse with an IPv4-compatible binding; Windows localhost may bind to IPv6 only. Metro workers are bounded to two for local/CI memory use.

## Validation and review

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm test:e2e`. Presentation tests cover kobo precision/overflow and countdown boundaries. Contrast checks cover actual brand/text pairings. Browser checks cover keyboard tabs, trapped/restored dialog focus, amount entry, OTP metadata, minimum targets, offline price hiding, watch state, reduced motion and responsive screenshots.

Screenshots and native review notes are in `docs/design/d01`. Owner approval of progression to T13 was recorded on 2026-10-25. This does not replace review of later money/bid changes or the outstanding provider setup.
