# Homepage demo inventory preview

Local preview: http://localhost:3300. Prepared 28 October 2026 with eight featured lots and four lots closing 8, 12, 16 and 19 minutes after setup. Top Deals lifetimes range from six hours to five days. These timers genuinely expire.

Only twelve new labelled preview lots and copied image metadata were inserted into the isolated `.env.demo` database. Existing auctions, their bids/end times, user accounts and ledger records were left alone. A system audit record records the insertion. There are no staff-portal changes.

Run `pnpm demo:home` again for a fresh preview set. Previous records are retained; no countdown is reset. This command is local demo tooling and cannot operate on the main or a remote database.

Focused verification: new-script lint and formatting passed; a real browser confirmed eight visible Top Deals cards and four visible Closing now cards, with screenshots below. No full-site suite or rebuild was needed for this data-only change.

- [Top Deals at 1440 px](top-deals-1440.png)
- [Closing now at 1440 px](closing-now-1440.png)
- [Recorded counts](review.json)
