# Outbid and Wallet review

`node scripts/check-outbid-wallet-ui.mjs` checks only this correction using local
synthetic API fixtures. It sends no mail or payments and places no bids.

Checks at 360, 768 and 1280 pixels: Wallet page heading; no Balance navigation
label; yellow reserved-funds panel with ink text; silently arriving unread outbid
bell notice linking to the correct item; Back to wallet link; no page errors or
horizontal overflow. Email previews share the brand tokens and escape dynamic
content through the API renderer.

- [Phone wallet](wallet-360.png), [alert](outbid-360.png), [email](email-360.png)
- [Tablet wallet](wallet-768.png), [alert](outbid-768.png), [email](email-768.png)
- [Desktop wallet](wallet-1280.png), [alert](outbid-1280.png), [email](email-1280.png)
