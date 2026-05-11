# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/app/template.db"

ARG FOOTER_COPYRIGHT
ARG FOOTER_ICP
ENV FOOTER_COPYRIGHT=$FOOTER_COPYRIGHT
ENV FOOTER_ICP=$FOOTER_ICP

# Generate Prisma client for Linux, create seeded DB template, build Next.js
RUN npx prisma generate && \
    npx prisma db push --skip-generate && \
    npx tsx prisma/seed.ts && \
    npm run build

# Bundle the worker with all its npm dependencies inlined so the standalone
# output does not need a separate node_modules for the worker process.
# Prisma is kept external because it uses native .node addons that esbuild
# cannot bundle; the Dockerfile already copies node_modules/.prisma and
# node_modules/@prisma into the runner stage for the main server.
RUN npx esbuild lib/queue/worker-entry.ts \
      --bundle \
      --platform=node \
      --target=node20 \
      --external:@prisma/client \
      --external:.prisma \
      --outfile=.next/standalone/worker.js

# ── Stage 3: Runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy standalone server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma client engine (needed by the app at runtime)
COPY --from=builder /app/node_modules/.prisma  ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma  ./node_modules/@prisma

# Copy empty DB template (schema already applied during build)
COPY --from=builder --chown=nextjs:nodejs /app/template.db /app/template.db

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Data directory for SQLite
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/entrypoint.sh"]
