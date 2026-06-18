# ── Stage 1: Install dependencies ──────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/

RUN pnpm install --filter backend... --frozen-lockfile

# ── Stage 2: Build ──────────────────────────────
FROM deps AS builder

COPY apps/backend/ apps/backend/

WORKDIR /app/apps/backend
RUN pnpm exec prisma generate
RUN pnpm run build

# ── Stage 3: Production Runner ──────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

# node-linker=hoisted → todas las deps viven en root node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json

# Asegurar que prisma esté disponible para el comando migrate deploy
ENV PATH /app/node_modules/.bin:$PATH

WORKDIR /app

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema ./apps/backend/prisma/schema.prisma && node apps/backend/dist/main"]
