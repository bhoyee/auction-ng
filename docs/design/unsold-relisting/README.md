# Unsold relisting controls

Responsive review at 360, 768 and 1280 pixels using synthetic staff credentials and inventory in an isolated database. No real operator account is created.

`manager-*.png` shows the compact lot controls; `saved-*.png` shows the saved no-bid relisting opt-out; `unsold-empty-*.png` shows the filtered empty state. The existing browser check also verifies keyboard-labelled controls, persistence through the real protected API, offline feedback, no horizontal overflow and no browser errors.

Run after building the API and starting the local admin/buyer apps:

```powershell
pnpm --filter api build
node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-admin-top-deals-ui.mjs --relisting
```

The API and account fixtures are isolated; the running apps are used only to serve their compiled UI. See `review.json` for the recorded results.
