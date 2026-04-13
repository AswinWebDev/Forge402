# AgentHub — Dockerfile for Google Cloud Run
# Runs the backend API (port 4000) + demo tool services (4001-4003)

FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY packages/ ./packages/
COPY start-services.js ./
COPY .env.example ./.env.example

# Create data directories
RUN mkdir -p data/agents

# The backend listens on PORT env (default 4000)
# Cloud Run sets PORT automatically
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Expose default port
EXPOSE 4000

# Start all services
CMD ["node", "start-services.js"]
