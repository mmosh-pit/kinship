# ── Stage 1: production dependencies (with native module compilation) ────────
FROM node:22-slim AS deps
WORKDIR /app

# Build tools required by argon2's native addon
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: TypeScript build ────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 3: lean production image ───────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# node_modules from deps stage (argon2 compiled for this runtime)
COPY --from=deps /app/node_modules ./node_modules

# Compiled JS from builder stage
COPY --from=builder /app/dist ./dist

# Drizzle migration files (enable migrate() in index.ts to auto-run on boot)
COPY drizzle ./drizzle

COPY package.json ./
COPY .env ./

EXPOSE 6050

CMD ["node", "dist/index.js"]
