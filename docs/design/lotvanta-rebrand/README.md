# LotVanta identity review

2026-11-04: supplied logo/icon used on local buyer and staff sites. Browser checks verify LotVanta page titles, loaded logo dimensions, live PNG favicons and absence of the former display wording at 360, 768 and 1280 px. The configured support domain is retained pending a verified replacement.

- [Buyer 360](web-360.png), [768](web-768.png), [1280](web-1280.png)
- [Staff 360](admin-360.png), [768](admin-768.png), [1280](admin-1280.png)
- [Footer 360](footer-360.png), [768](footer-768.png), [1280](footer-1280.png)

Changed-file lint, all affected app/shared UI types, 56 focused email/SMTP/auth-label/provider tests and web/admin/API production builds pass. Docker layer-depth prevents another snapshot image; previews were built in the existing app containers, without restarting Redis/PostgreSQL or changing data. Mobile code uses the supplied local logo and icon; native visual capture, installed app identity and full T14 acceptance remain pending the next EAS build/phone review. Existing screenshots are retained as historical evidence.

Android and iOS production bundle exports also pass using explicit test HTTPS origins; no build was published. The local SMTP sender display name is LotVanta, with existing sender address/credentials retained. All nine services are healthy; mobile HTTP and fresh Socket.IO snapshots were rechecked.
