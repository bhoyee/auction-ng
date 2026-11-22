# syntax=docker/dockerfile:1.7-labs
# Production image for web, admin, api, realtime and worker (mobile excluded).
# One image, one build; each Compose service runs a different start command.
#
# Deploys build on the live server, so the image is layered to reuse work
# between builds (2026-11-21). Installed packages are their own stage and
# image layer, rebuilt only when a package.json or the lockfile changes; the
# pnpm store, Turborepo and Next.js caches persist in BuildKit cache mounts
# (never in the image). A code-only change rebuilds just the apps that
# changed and ships only the source and build output as a new layer.
FROM node:22.23.4-bookworm-slim AS base
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.18.3

FROM base AS deps
ENV npm_config_store_dir=/pnpm-store
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
# Every workspace manifest; add a line here when a workspace is added.
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY apps/realtime/package.json apps/realtime/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/api-client/package.json packages/api-client/
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=lotvanta-pnpm-store,target=/pnpm-store \
  pnpm install --frozen-lockfile

FROM deps AS build
# node_modules is in .dockerignore, so this keeps the installed packages.
COPY . .
RUN pnpm db:generate
# Public URLs are compiled into the Next.js bundles, so they are build args.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_REALTIME_URL
ARG NEXT_PUBLIC_BUYER_URL
# Optional; empty leaves the Contact us form on honeypot + rate limits only.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
  NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL \
  NEXT_PUBLIC_BUYER_URL=$NEXT_PUBLIC_BUYER_URL \
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
  NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_API_URL" && test -n "$NEXT_PUBLIC_REALTIME_URL" \
  && test -n "$NEXT_PUBLIC_BUYER_URL"
RUN --mount=type=cache,id=lotvanta-turbo,target=/workspace/.turbo/cache \
  --mount=type=cache,id=lotvanta-next-web,target=/workspace/apps/web/.next/cache \
  --mount=type=cache,id=lotvanta-next-admin,target=/workspace/apps/admin/.next/cache \
  pnpm exec turbo run build --filter=!mobile --cache-dir=.turbo/cache

FROM node:22.23.4-bookworm-slim AS runtime
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@10.18.3
# Packages first (unchanged between most deploys, so this layer is reused),
# then the source and build output without node_modules.
COPY --from=deps --chown=node:node /workspace /workspace
COPY --from=build --chown=node:node --exclude=**/node_modules /workspace /workspace
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
