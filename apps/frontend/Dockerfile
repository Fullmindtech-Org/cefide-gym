# ── Stage 1: Install dependencies ──────────────
FROM node:22.23.4-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/frontend/package.json apps/frontend/

RUN pnpm install --filter frontend... --frozen-lockfile

# ── Stage 2: Build ─────────────────────────────
FROM node:22.23.4-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY .npmrc pnpm-workspace.yaml package.json ./
COPY apps/frontend/ apps/frontend/

WORKDIR /app/apps/frontend

RUN pnpm run build

# ── Stage 3: Serve static (dev/preview) ───────
# Nota: en produccion, el frontend se despliega en Cloudflare Pages.
# Este stage es solo para dev local con Docker.
FROM node:22.23.4-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY --from=builder /app/apps/frontend/ ./apps/frontend/
COPY .npmrc pnpm-workspace.yaml package.json ./

WORKDIR /app/apps/frontend

EXPOSE 5173

CMD ["pnpm", "dev", "--host"]
