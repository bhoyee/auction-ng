# Outbid alerts and Wallet polish

An accepted bid can displace the previous leader or be immediately overtaken by
an existing automatic bidder. Both cases create one owned `outbid-v1` in-app and
email notification for the affected bidder. A first bid, own raise or continuing
automatic leader does not create an alert for that leader. Watching the item is
not required. These alerts do not change saved Watching/Won/Lost history.

The existing atomic Lua script appends its already-computed previous leader ID
to the durable accepted-event stream. Public broadcasts and bid resolution stay
unchanged. The existing proof-validated persistence transaction creates the alert
alongside its immutable receipt; replay uses the same event fingerprint and
unique `outbid:{preparationId}:{userId}:{lotId}` notification reference. Legacy
events without this metadata remain replayable without historical alert mail.
There is no database migration or new dependency/environment variable.

The existing owner-only notification list, summary and read APIs now include this
template. Their typed client and Swagger contract are unchanged: metadata only,
cursor pagination and validated relative item links. No bidder identity or private
maximum is exposed in the bell or email. The message explicitly describes a past
outbid event and asks buyers to check current price, time and fees before rebidding.
It never assumes they still lead/lose when a delayed email arrives.

Email uses the existing SMTP/Mailpit adapter and shared-token HTML/text template.
The closing worker delivers pending notices, with the existing stable provider
key `auction-ng/notification/{id}`, row locks and retries. The bell silently polls
every fifteen seconds while visible/online and refreshes on focus/opening.
Ordinary SMTP cannot guarantee recipient-side exactly-once delivery after an
ambiguous network failure; the persisted in-app notice remains unique.

Buyer page/sidebar/account-menu labels are now Wallet. The payment-return link
says Back to wallet. Balance remains the term for the amount in the wallet.
Reserved funds have an owner-approved yellow panel, ink text and existing shared
radius/spacing tokens. Wallet maths and payment/bid rules are unchanged.

MONEY/BID CHANGE — needs human review: the bid stream metadata and persistence
transaction changed to record notifications; bid selection, increments, holds,
soft close and financial settlement were not changed.

Targeted checks only: Lua parity and 500-contender concurrency; bid receipt
replay/recovery, displaced leaders, immediately outbid challengers and own raises;
notification ownership, email rendering and failed-send retry; affected lint/type
checks and API/web builds; wallet/bell/email captures at 360/768/1280 pixels in
[the review](../design/outbid-wallet/README.md). Existing broader journey scripts
have their Wallet label expectations updated; the full application suite was not
run for this correction.
