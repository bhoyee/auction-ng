# Watchlist loss review

Run `node scripts/check-watchlist-loss-ui.mjs` with the local Docker buyer site
running. It uses synthetic authenticated API/socket fixtures; it does not bid,
send email, make payments or modify customer records.

At 360, 768 and 1280 pixels the saved item automatically leaves Watching, the
header/sidebar active count decreases, the bell displays a red unread badge with
the loss message, and the item remains in Lost without a bid button. There is no
manual reload or horizontal overflow. Shared type, colour, spacing and components
are retained. Screenshots and machine-readable results are beside this file.

- [Phone alert](notification-360.png) and [Lost history](lost-360.png)
- [Tablet alert](notification-768.png) and [Lost history](lost-768.png)
- [Desktop alert](notification-1280.png) and [Lost history](lost-1280.png)
- Email preview: [phone](email-360.png), [tablet](email-768.png),
  [desktop](email-1280.png)
