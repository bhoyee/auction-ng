FROM node:22.23.4-bookworm-slim AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.18.3
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_REALTIME_URL=http://localhost:4001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
RUN pnpm exec turbo run build --filter=!mobile

FROM node:22.23.4-bookworm-slim AS local
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.18.3
COPY --from=build --chown=node:node /workspace /workspace
ENV NODE_ENV=production
USER node
