# syntax=docker/dockerfile:1

# Build stage: install everything, build CSS and the editor bundle, then drop dev packages.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage: production packages and built assets only, running as the unprivileged node user.
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app ./
RUN mkdir -p public/uploads && chown node:node public/uploads
USER node

# Uploaded images live here; mount a volume so they survive redeploys.
VOLUME ["/app/public/uploads"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

# Apply database migrations (safe to repeat), then start the server as PID 1 so it receives SIGTERM.
CMD ["sh", "-c", "node db/migrate.js && exec node src/server.js"]
