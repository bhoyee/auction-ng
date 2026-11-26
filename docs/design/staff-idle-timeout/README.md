# Staff inactivity warning

`warning-360.png`, `warning-768.png` and `warning-1280.png` show the final-minute
warning using synthetic staff/browser fixtures. The dialog uses shared tokens,
buttons, focus handling and error banners. Stay signed in is the default action;
closing the warning signs out. The final eight-hour warning instead explains
that signing in again is required. No real account, token, password or code is
included.

Browser checks cover automatic logout, trusted/throttled interaction, explicit
continuation, failed continuation, reload, a sleeping Pickup app and the absolute
limit, plus existing staff password/renewal behavior. Server integration tests
cover inactivity boundaries, refresh/polling, realtime expiry, concurrent
activity/rotation, strict HTTP validation, origin checks and unaffected buyers.
