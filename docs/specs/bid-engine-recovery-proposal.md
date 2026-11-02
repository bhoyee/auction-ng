# Bid-engine recovery workflow

## Observed local blocker, 2026-11-02

After the hung Docker Desktop engine was recovered, PostgreSQL completed its own safe WAL recovery. HTTP catalogue endpoints, the server clock, the public Socket.IO connection and its clock acknowledge requests through the PC's LAN address. Fresh public lot snapshots return HTTP 503 because the bid runtime deliberately pins the Redis process identity.

A read-only report on the existing demo namespace found:

- The stored Redis process identity and runtime marker differ from the current process.
- Redis contains 58 accepted events; PostgreSQL contains 58 acceptance records.
- Funding intents include 57 released records and one retained record.
- One active bid-related wallet hold remains.

Counts alone do not establish safe recovery. No runtime marker, ledger entry, hold, bid, balance or historical record was changed. Do not clear the marker, seed a replacement namespace or release a hold to make the UI connect.

## Proposed separately reviewed work

1. Keep bid acceptance, closing and purchases fenced during review. Produce a bounded read-only reconciliation report covering every accepted stream event/fingerprint, durable funding intent, reservation, persistence/closing cursor, pending purchase and cancellation/pre-bid barrier. Never print private limits or authentication material.
2. Verify Redis durability/AOF recovery and compare actual immutable outcomes, not just event counts. Preserve uncertain reservations. Any discrepancy stops recovery and requires operator investigation.
3. Prepare a dry-run result tied to the exact database, namespace, old/new Redis identities and a report fingerprint. Require explicit operator approval of that result and an audit reason before enabling a recovery operation.
4. Implement durable, idempotent recovery with database/Redis fences and the existing ledger service for any necessary reconciliation. A guarded runtime rebind is allowed only after the approved report still matches; it must not silently bypass the existing startup safeguard.
5. Test replay/retry, missing or modified events, concurrent startup, interrupted recovery, pending purchases/closing/pre-bids, reservation conservation and unchanged ledger balances before any successful resume. Verify public and authenticated snapshots, then re-run the mobile connectivity check.

MONEY/BID CHANGE - needs human review. The owner separately approved implementation of this workflow on 2026-11-02. Production recovery remains outside this local-demo command's scope.

## Local operator command

`pnpm bids:recover:demo` performs a read-only audit of the existing demo database and Redis namespace. It refuses incomplete receipts, missing events, changed proofs, uncertain funding, unfinished purchases/settlements/cancellations and funded pre-bid launches. It checks durable Redis configuration and ledger invariants. Counts alone never authorise recovery.

Stop only Auction NG's API, realtime and worker before applying. The CLI verifies their Compose containers and local ports are stopped. Keep PostgreSQL and Redis running. After reviewing the exact dry-run report, run:

```powershell
pnpm bids:recover:demo --apply --fingerprint <report-fingerprint> --key <new-UUID> --operator "Local operator" --reason "Restore preserved local demo after verified Redis restart"
```

The command writes an encrypted idempotency receipt and audit record, fences startup, then conditionally rebinds the preserved runtime identity. Recovery does not alter bids, holds, ledger entries or balances. If interrupted, retry the identical command and key; never remove the fence manually. A changed report or another Redis restart stops recovery.

Completed Buy Now markers require a matching paid invoice and line, debit receipt, closed stock and completed reservation release. Empty scheduled launches require no bids, funding intents or pre-bids; their flags remain unchanged for the existing worker to finish. Funded launches require separate investigation.

This first workflow is bounded to 10,000 Redis keys/events/records and 500 wallets. Cancellation-bearing streams and uncertain state require separate review. It cannot reconstruct missing Redis data. Restart the reviewed API build and existing realtime/worker only after completion, then run `pnpm mobile:check` to verify actual fresh lot snapshots.

Local demo recovery completed on 2026-11-02. LAN HTTP and fresh Socket.IO snapshots passed after restart. See [validation and review](../reviews/bid-runtime-recovery.md). T14 remains in progress.
