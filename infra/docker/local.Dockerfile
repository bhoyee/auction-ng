FROM node:22.23.4-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.18.3
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=!mobile

FROM node:22.23.4-bookworm-slim AS local
WORKDIR /workspace
RUN npm install --global pnpm@10.18.3
COPY --from=build --chown=node:node /workspace /workspace
ENV NODE_ENV=production
USER node
