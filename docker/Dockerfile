# syntax=docker/dockerfile:1.7

FROM node:20-alpine3.21 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global npm@11.6.2 \
    && addgroup --system --gid 1001 appgroup \
    && adduser --system --uid 1001 --ingroup appgroup appuser

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS development
ENV NODE_ENV=development
COPY --chown=appuser:appgroup . .
RUN mkdir -p /app/.next && chown -R appuser:appgroup /app/.next
USER appuser
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM dependencies AS builder
ENV NODE_ENV=production
ENV DOCKER_STANDALONE=true
COPY . .
RUN npm run build

FROM base AS web-runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public
COPY --from=builder --chown=appuser:appgroup /app/scripts/migrate.mjs ./scripts/migrate.mjs
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]

FROM dependencies AS worker-runtime
ENV NODE_ENV=production
COPY --chown=appuser:appgroup . .
USER appuser
CMD ["npm", "run", "worker"]
