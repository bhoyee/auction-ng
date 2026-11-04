# Local mobile refresh incident — 2026-11-03

The mobile refresh message coincided with an actual local backend outage. The API's HTTP health endpoint responded, but realtime health returned 503 and the worker/realtime logs reported Redis unavailable. Redis container inspection showed it had exited; Docker reported an invalid overlay mount and a read-only filesystem while reading its logs. Docker's cached container list incorrectly continued to show healthy services.

Windows C: had approximately 2.5 GB free. This is disk pressure worth addressing, but it alone does not establish the cause of the filesystem failure.

The normal Docker restart failed to stop its hung processes. Only verified Docker installation processes and the Docker WSL distribution were stopped. After a WSL startup timeout, a clean WSL shutdown was used only after confirming no other WSL distributions were running. Docker then responded again and Redis AOF loading completed with healthy persistence status. No volumes were reset, no keys/data were deleted and no wallet holds were released.

API, worker and realtime were paused for the existing owner-approved runtime recovery workflow. PostgreSQL was allowed to complete its own filesystem sync/recovery; fsync and WAL safeguards were not changed.

The read-only audit passed with 59 accepted events and one active reservation. The existing idempotent recovery command completed against that exact fingerprint without changing ledger entries or reservations. API/realtime/worker then resumed; all nine LotVanta containers are healthy. `pnpm mobile:check` passes LAN HTTP/catalogue/time and a fresh public Socket.IO lot snapshot. The phone still needs to reload Expo Go; no current physical-phone result is claimed.

No application code or dependency changed. No broad test suite was run for this operational repair. Low host disk space remains open: free space outside the project/Docker data before further large builds. Recovery did not delete files, images, databases, Redis keys or volumes.
