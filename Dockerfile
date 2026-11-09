# Dockerfile for DrexPilot on Render / Railway
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .
RUN mkdir -p public

# Build web frontend (static export to ./out) and server backend (to ./dist)
RUN npm run build:web
RUN npm run build:server

# Production runner stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/out ./out
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/server/db/migrations ./dist/server/db/migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 10000

CMD ["node", "dist/server/index.js"]
