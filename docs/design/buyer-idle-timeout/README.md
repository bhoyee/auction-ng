# Buyer inactivity warning review

Browser evidence at 360, 768 and 1280 pixels uses a synthetic buyer profile and mocked session deadlines. The dialog uses existing shared brand controls, a red close/sign-out action, keyboard focus on Stay signed in and a visible countdown. Protected content disappears on expiry and the sign-in page explains why.

Targeted flows cover expiry, confirmed continuation, failed continuation and server-verified activity from another tab. Native uses the existing mobile Dialog, Notice and Button components. Physical-device visual/background review remains pending; no Android phone was connected during implementation.

The local production item-route check measured 238,219 compressed JavaScript bytes for guests and 244,151 for signed-in buyers, below the unchanged 245,000-byte budget. Deadline checks load immediately; warning-dialog visuals load only when needed without suspending or restarting the monitor. Header notifications retain their existing polling and delivery behaviour through a focused typed client.

Verification: 39 focused unit/integration tests and nine browser flows passed, alongside affected lint/type checks, API/web builds and Android/iOS bundle exports. Full CI requirements remain unchanged. No production deployment or physical-device acceptance is claimed.
