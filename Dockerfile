# AgentHub — Dockerfile for Google Cloud Run
# Runs the backend API (port 4000) + demo tool services (4001-4003)

FROM node:20-slim

# Install CA certificates for outbound HTTPS (Stellar RPC, x402, CoinGecko)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY packages/ ./packages/
COPY public/ ./public/
COPY start-services.js ./

# Create data directories
RUN mkdir -p data/agents

# The backend listens on PORT env (default 4000)
ENV NODE_ENV=production
ENV REGISTRY_URL=http://localhost:4000

# Expose default port
EXPOSE 4000

# Start all services
CMD ["node", "start-services.js"]
