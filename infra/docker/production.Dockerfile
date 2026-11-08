# Production image for web, admin, api, realtime and worker (mobile excluded).
# One image, one build; each Compose service runs a different start command.
FROM node:22.23.4-bookworm-slim AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.18.3
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
# Public URLs are compiled into the Next.js bundles, so they are build args.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_REALTIME_URL
ARG NEXT_PUBLIC_BUYER_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
  NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL \
  NEXT_PUBLIC_BUYER_URL=$NEXT_PUBLIC_BUYER_URL \
  NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_API_URL" && test -n "$NEXT_PUBLIC_REALTIME_URL" \
  && test -n "$NEXT_PUBLIC_BUYER_URL"
RUN pnpm exec turbo run build --filter=!mobile

FROM node:22.23.4-bookworm-slim AS runtime
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@10.18.3
COPY --from=build --chown=node:node /workspace /workspace
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
