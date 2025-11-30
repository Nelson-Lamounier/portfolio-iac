FROM node:22-alpine AS base
RUN corepack enable && \
    apk add --no-cache libc6-compat

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy root workspace files for monorepo
COPY package.json yarn.lock .yarnrc.yml ./
COPY frontend/package.json ./frontend/

# Install dependencies (workspace-aware)
RUN yarn workspaces focus frontend

# Builder stage
FROM base AS builder
WORKDIR /app

# Copy workspace configuration
COPY package.json yarn.lock .yarnrc.yml ./
COPY --from=deps /app/node_modules ./node_modules

# Copy frontend source code
COPY frontend ./frontend

# Build Next.js application
WORKDIR /app/frontend
RUN yarn build

# Runner stage - production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone build (includes monorepo structure)
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./

# Copy static files to the correct location within the monorepo structure
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static

# Copy public directory if it exists
COPY --from=builder --chown=nextjs:nodejs /app/frontend/public ./frontend/public 2>/dev/null || true

# Switch to non-root user
USER nextjs

# Expose port (can be overridden at runtime)
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check with dynamic port support
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3000; require('http').get('http://localhost:' + port + '/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start application from the frontend directory within standalone
CMD ["node", "frontend/server.js"]