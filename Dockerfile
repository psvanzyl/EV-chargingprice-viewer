# EV Charging Price Viewer — Next.js webapp build for Coolify.
# The data-pipeline runs separately (locally/CI) and writes static data into
# webapp/public/ before this build. This image just builds + serves the webapp.
FROM node:20-alpine AS deps
WORKDIR /app
COPY webapp/package.json webapp/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY webapp/ ./
# Ensure static data dir exists (may be empty if pipeline hasn't run).
RUN mkdir -p public/data
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npm", "run", "start"]
