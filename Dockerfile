# rechase: PWA plus kleiner Node-Server in einem Container. Gebaut wird in GitHub Actions, nie auf dem VPS.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000
# Commit, den die App anzeigen kann (setzt die GitHub Action).
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
WORKDIR /app
# Der Server ist mit esbuild gebündelt und braucht kein node_modules.
COPY --from=build /app/package.json ./
COPY --from=build /app/build ./build
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
# Pflicht: update.sh wartet auf "healthy" und rollt sonst zurück.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "build"]
