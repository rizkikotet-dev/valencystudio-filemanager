# syntax=docker/dockerfile:1

###############################################################################
# ValencyStudio File Manager — production image
#
# Multi-stage (Bun runtime):
#   deps      : install dependensi root + realtime-service + prisma generate
#   builder   : next build (standalone — static & public digabung otomatis)
#   deps-prod : node_modules production-only + prisma generate (untuk runner)
#   runner    : image akhir non-root — Next.js :3000 + realtime fan-out :3003
#
# State disimpan di dua volume:
#   /app/db       → SQLite (DATABASE_URL=file:/app/db/custom.db)
#   /app/storage  → part file untuk backend penyimpanan lokal
#
# Build :  docker build -t valencystudio .
# Run   :  docker compose up -d   (lihat DEPLOY.md)
###############################################################################

# ──────────────────────────────── deps ──────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app

# Lockfile + schema dulu agar layer cache efektif
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY mini-services/realtime-service/package.json mini-services/realtime-service/bun.lock ./mini-services/realtime-service/

RUN bun install --frozen-lockfile

# node_modules mandiri untuk realtime-service (socket.io).
# bun:sqlite adalah builtin Bun — tidak butuh dependensi tambahan.
RUN cd mini-services/realtime-service && bun install --frozen-lockfile

# Bun tidak menjalankan lifecycle script pihak ketiga secara default —
# generate Prisma Client + engine linux (debian/openssl-3) secara eksplisit.
RUN bunx prisma generate

# ─────────────────────────────── builder ────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder build-time — nilai asli disuntikkan saat runtime
# (via .env + docker-compose / docker run). Build tidak boleh
# bergantung pada secret apa pun.
ENV DATABASE_URL="file:/tmp/build.db" \
    TELEGRAM_BOT_TOKEN="build-placeholder" \
    TELEGRAM_STORAGE_CHAT_ID="-100" \
    WEB_DEFAULT_ADMIN_EMAIL="admin@example.com" \
    WEB_DEFAULT_ADMIN_PASSWORD="build-placeholder"

# next build + penggabungan .next/static & public ke .next/standalone
# (didefinisikan pada script "build" di package.json)
RUN bun run build

# ────────────────────────────── deps-prod ───────────────────────────────────
# Production-only node_modules untuk runner (app + prisma CLI + client engine).
# Runner TIDAK BOLEH cherry-pick subfolder node_modules (mis. hanya @prisma/ —
# prisma CLI butuh dependensi transitif seperti `effect` via @prisma/config,
# dan daftarnya bisa berubah tiap rilis Prisma). Full production set = superset
# yang stabil; devDependencies (typescript, eslint, …) tetap dikecualikan.
FROM oven/bun:1 AS deps-prod
WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma

RUN bun install --frozen-lockfile --production \
 && bunx prisma generate

# ─────────────────────────────── runner ─────────────────────────────────────
FROM oven/bun:1 AS runner
WORKDIR /app

# User non-root deterministik
RUN useradd --uid 1001 --create-home --shell /bin/sh valency

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TZ=Asia/Jakarta \
    DATABASE_URL="file:/app/db/custom.db" \
    REALTIME_DB_PATH="/app/db/custom.db" \
    REALTIME_URL="http://127.0.0.1:3004" \
    REALTIME_INTERNAL_KEY="vs-internal-key"

# Server standalone (server.js + .next + static + public + traced node_modules)
COPY --from=builder --chown=valency:valency /app/.next/standalone ./

# Full production node_modules MENIMPA traced subset (superset: app runtime +
# prisma CLI + effect + client engine). Prisma CLI + client + engine — untuk
# `db push` zero-touch saat container start.
COPY --from=deps-prod --chown=valency:valency /app/node_modules ./node_modules
COPY --chown=valency:valency prisma ./prisma

# Realtime fan-out service (socket.io) — node_modules mandiri
COPY --from=deps --chown=valency:valency /app/mini-services/realtime-service ./mini-services/realtime-service

# Entrypoint (chmod + guard CRLF untuk editor Windows)
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN sed -i 's/\r$//' ./docker/entrypoint.sh && chmod 755 ./docker/entrypoint.sh

# Direktori state — dimount sebagai volume oleh docker-compose
RUN mkdir -p /app/db /app/storage/parts && chown -R valency:valency /app

USER valency

EXPOSE 3000 3003
VOLUME ["/app/db", "/app/storage"]

# Healthcheck: /api mengembalikan 200 { ok:true, db:"up" } saat sehat
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api'); process.exit(r.ok ? 0 : 1)" || exit 1

ENTRYPOINT ["/app/docker/entrypoint.sh"]
