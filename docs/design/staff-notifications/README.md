# Staff notification review

Bell and inbox captures at 360, 768 and 1280 px use synthetic API fixtures against the updated admin preview. They verify five-second silent counter/overview updates without navigation, unread-to-read changes, preserved email status, empty/error handling and no document/dialog overflow. Socket routing is verified separately against a real isolated Redis/Socket.IO gateway; intercepted browser responses do not claim real email delivery.

Unread alerts use a restrained indigo surface, yellow New badge and WAT time. The header bell has an accessible unread label and a red count. All controls use shared components/tokens, keyboard-operable dialogs and 44 px targets. Local previews are explicitly distinguished from external SMTP delivery. No real customer or credential data is shown.

Review evidence: `bell-{360,768,1280}.png`, `inbox-{360,768,1280}.png`, `empty-{360,768,1280}.png` and `error-{360,768,1280}.png`.

Local Docker rollout: additive migration applied; API, admin and realtime production builds passed and all three restarted healthy. The existing worker processed three captured events into three saved email previews with no pending source events at verification. External SMTP delivery was not tested; the owner selected preview mode for now.
