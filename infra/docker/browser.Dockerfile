FROM auction-ng-local AS dependencies
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /workspace
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=dependencies /usr/local/lib/node_modules/pnpm /usr/local/lib/node_modules/pnpm
RUN ln -sf ../lib/node_modules/pnpm/bin/pnpm.cjs /usr/local/bin/pnpm
COPY --from=dependencies /workspace/node_modules /workspace/node_modules
COPY --from=dependencies /workspace/apps/api/node_modules /workspace/apps/api/node_modules
COPY --from=dependencies /workspace/apps/web/node_modules /workspace/apps/web/node_modules
COPY --from=dependencies /workspace/apps/admin/node_modules /workspace/apps/admin/node_modules
COPY --from=dependencies /workspace/apps/realtime/node_modules /workspace/apps/realtime/node_modules
COPY --from=dependencies /workspace/packages/shared/node_modules /workspace/packages/shared/node_modules
COPY --from=dependencies /workspace/packages/api-client/node_modules /workspace/packages/api-client/node_modules
COPY --from=dependencies /workspace/packages/ui/node_modules /workspace/packages/ui/node_modules
COPY --from=dependencies /workspace/packages/config/node_modules /workspace/packages/config/node_modules
COPY . .
RUN pnpm db:generate
CMD ["node", "scripts/browser-container.mjs"]
