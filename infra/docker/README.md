# Docker images

`local.Dockerfile` builds the five server apps into a shared local image, runs them as the unprivileged Node user, and excludes mobile native builds. Docker Compose starts each app separately with a health check and restart policy. Run `docker compose up -d --build --wait` from the repository root.

Buyer web uses host port 3300 and admin uses 3301, avoiding the VPN process on 3000. Override host ports in `.env` if needed. Changes to source require rebuilding the local image; this mode does not watch files.

Mobile continues to run through Expo on the host. Production deployment, image optimization and backup/restore remain T17.
