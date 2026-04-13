# Forge402 — Autonomous x402 Agent Marketplace

> AI agents that discover, evaluate, and pay for data services autonomously using USDC on Stellar.

**Built for Stellar Hacks 2026** · x402 Protocol · USDC Micropayments · Venice AI Orchestration

---

## What is Forge402?

Forge402 is an open-source marketplace where:

- **Tool Providers** deploy x402-protected API services and earn USDC per request
- **Users** deploy autonomous AI agents that run 24/7 on a schedule
- **The Platform** provides orchestration (Venice AI), guardrails (budget limits), and curation (admin approval)

Every payment is a verifiable USDC transaction on Stellar. No API keys, no subscriptions, no human in the loop.

---

## 🔌 How to Test the MCP Server (For Judges)

We have included a production-ready **Model Context Protocol (MCP)** server that connects local AI clients (like Claude Desktop or Cursor) to our decentralized, x402-protected intelligence services.

Because the server natively utilizes the `@x402/fetch` SDK, your AI will sign UDC micropayments on Stellar in the background completely autonomously!

**Step-by-Step Setup for Claude Desktop / Cursor:**
1. Clone this repository and run `npm install`.
2. Open your Claude Desktop / Cursor MCP configuration file.
3. Add the following to your `mcpServers` object (replace `/path/to/Forge402` with your actual cloned path!):

```json
{
  "mcpServers": {
    "forge402": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/Forge402",
      "env": {
        "AGENT_STELLAR_SECRET": "YOUR_STELLAR_SECRET_KEY",
        "AGENTHUB_URL": "http://localhost:4000"
      }
    }
  }
}
```
*Note: If you want to connect to our hosted Cloud Run instance instead of local, change the URL to `https://forge402-826948357081.us-central1.run.app`.*

4. **The Magic:** In a new Claude/Cursor chat, simply say: 
   *"List available tools on Forge402"* or 
   *"Use the Forge402 sentiment analyzer tool to analyze Bitcoin's latest news."* 
   Watch as the AI executes the tool and signs the micropayment autonomously!

---

## How It Works

### Agent-to-Agent (the core product)
```
1. Agent A has a Stellar wallet with USDC
2. Agent A calls POST /api/agents/deploy → pays $1.00 USDC via x402
3. A sub-agent is deployed: "Monitor VVV token price every 2h"
4. Sub-agent wakes up → Venice AI plans which marketplace tools to call
5. Sub-agent pays each tool via x402 (USDC on Stellar, ~5sec settlement)
6. Sub-agent adapts: data reveals a GitHub repo → auto-audits it
7. Venice AI synthesizes findings into actionable report
8. When credits run out → agent auto-pauses → Agent A tops up via x402
```

### Human via Dashboard
```
1. User browses tool marketplace → registers tools → admin approves
2. User deploys agent from dashboard with USDC credit deposit
3. Monitors reports, credits, payments — all verifiable on Stellar Explorer
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js, Port 3000)                              │
│  Landing · Tool Marketplace · Agent Console · Admin · Docs  │
└─────────────────────┬───────────────────────────────────────┘
                      │ API calls
┌─────────────────────▼───────────────────────────────────────┐
│  BACKEND (Express, Port 4000)                               │
│                                                             │
│  📋 Tool Registry         🤖 Agent Daemon                  │
│  - Register/approve tools  - Deploy/pause/resume agents     │
│  - Price caps ($5 max)     - Scheduled autonomous runs      │
│  - Admin approval queue    - Report storage + webhooks      │
│                                                             │
│  🧠 Orchestrator (shared core)                              │
│  - Venice AI planning + synthesis                           │
│  - x402 auto-payment via @x402/fetch                        │
│  - Adaptive execution (reacts to data)                      │
│  - Budget guardrails (abort if exceeded)                    │
│  - 5% platform fee on tool costs                            │
│                                                             │
│  🌐 HTTP Gateway: POST /api/mission ($0.10 x402 paywall)   │
│  🔌 MCP Server: IDE integration (Cursor/Claude)            │
└─────────────────────┬───────────────────────────────────────┘
                      │ x402 USDC payments
┌─────────────────────▼───────────────────────────────────────┐
│  TOOL MARKETPLACE (independently deployed x402 services)    │
│                                                             │
│  Token Data ($0.01) · GitHub Auditor ($0.05) · Web ($0.02) │
│  + Any third-party x402 service registered on the platform  │
│                                                             │
│  Each tool is an Express server + @x402/express middleware   │
│  Each tool has its OWN Stellar wallet → earns USDC directly │
└─────────────────────────────────────────────────────────────┘
```

---

## Revenue Model

| Revenue Source | Amount | When |
|---|---|---|
| **User credit deposits** | User-defined (min $0.01) | Users fund agents upfront |
| Gateway paywall | $0.10 per mission | External agents call `/api/mission` |
| Orchestration fee | 5% of tool costs (min $0.005) | Every tool payment in any mission |
| Tool providers | 100% of tool price | Paid directly via x402 |

**How agents are funded:** Users deposit USDC credits when deploying agents. Each run deducts tool costs + 5% platform fee from credits. When credits run out, the agent auto-pauses. Users can top up anytime.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Funded Stellar Testnet wallet ([Circle Faucet](https://faucet.circle.com) for USDC, [Friendbot](https://friendbot.stellar.org) for XLM)
- Venice AI API key ([venice.ai](https://venice.ai))

### 1. Clone and Install
```bash
git clone https://github.com/your-repo/forge402.git
cd forge402
npm install
cp .env.example .env  # configure your keys
```

### 2. Configure `.env`
```env
VENICE_API_KEY=your_venice_key
GITHUB_TOKEN=your_github_token
STELLAR_CLIENT_SECRET=your_stellar_secret
STELLAR_CLIENT_PUBLIC=your_stellar_public
STELLAR_PROVIDER_SECRET=your_provider_secret
STELLAR_PROVIDER_PUBLIC=your_provider_public
ADMIN_KEY=your_admin_password
```

### 3. Start Backend + Tools
```bash
node start-services.js
```
This starts: Backend API (4000) + 3 demo tool servers (4001-4003)

### 4. Start Dashboard
```bash
cd packages/dashboard && npm run dev
```
Open http://localhost:3000

### 5. Deploy an Agent
Via dashboard (Agents → Deploy) or API:
```bash
curl -X POST http://localhost:4000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VVV Watchdog",
    "goal": "Look up VVV token price, market cap, volume. Alert if price drops >10%",
    "schedule_minutes": 120,
    "max_budget_per_run": 0.15,
    "credit_deposit": 2.00
  }'
```

---

## Security Model

| Aspect | Implementation |
|---|---|
| Private keys | Server-side `.env` only. Never exposed via UI or API. |
| User input | Users provide: name, goal, schedule, budget. No secrets. |
| x402 signing | Local Soroban auth entry signing. Keys never leave the server. |
| Tool approval | Admin must approve tools before they go live. Price caps enforced. |
| Spending limits | Per-mission budget. Auto-abort if exceeded. |

---

## API Reference

**Base URL:** `http://localhost:4000`

### x402-Protected (Agents pay USDC — no human required)
| Method | Endpoint | Price | Description |
|---|---|---|---|
| POST | `/api/agents/deploy` | $1.00 | Deploy a sub-agent (x402 payment IS the credit deposit) |
| POST | `/api/agents/topup` | $0.50 | Top up agent credits |
| POST | `/api/mission` | $0.10 | Run a one-off intelligence mission |

### Tools (Free)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/tools` | — | List approved marketplace tools |
| POST | `/api/tools/register` | — | Register new tool (pending admin approval) |
| GET | `/api/budget-estimate` | — | Auto-calculated cost per agent run |

### Agents (Dashboard / Admin)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/agents` | Deploy agent (admin, requires `credit_deposit`) |
| POST | `/api/agents/:id/deposit` | Top up credits (dashboard) |
| GET | `/api/agents` | List all agents (with credits + status) |
| GET | `/api/agents/:id` | Agent details + reports |
| PATCH | `/api/agents/:id/pause` | Pause agent |
| PATCH | `/api/agents/:id/resume` | Resume (validates credits first) |
| DELETE | `/api/agents/:id` | Remove agent |

### Platform
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/wallet` | Platform wallet balance |
| GET | `/api/stats` | Platform statistics |
| POST | `/api/tools/:id/approve` | Approve tool (admin key required) |

---

## Tech Stack

- **Backend:** Express.js, Node.js
- **Frontend:** Next.js 16, vanilla CSS (dark mode)
- **AI:** Venice AI (llama-3.3-70b) for planning + synthesis
- **Payments:** x402 protocol (`@x402/fetch`, `@x402/express`, `@x402/stellar`)
- **Blockchain:** Stellar Testnet, USDC, Soroban auth entries
- **MCP:** Model Context Protocol for IDE integration

---

## Project Structure

```
Agent_Hub/
├── packages/
│   ├── core/orchestrator.js       # Shared brain (Venice AI + x402 + guardrails)
│   ├── gateway/server.js          # Unified backend API (port 4000)
│   ├── mcp-server/src/index.ts    # IDE integration
│   ├── dashboard/                 # Next.js frontend (port 3000)
│   └── tools/                     # Demo x402 services
│       ├── token-data/            # CoinGecko wrapper ($0.01)
│       ├── github-auditor/        # GitHub API wrapper ($0.05)
│       └── web-research/          # Web scraper ($0.02)
├── data/
│   ├── registry.json              # Tool registry
│   └── agents/                    # Agent state + reports
├── start-services.js              # Launch all services
└── .env                           # Server-side configuration
```

---

## Production Deployment

Forge402 runs on **Stellar Testnet** with real (test) USDC. Judges can verify every payment on [Stellar Explorer](https://stellar.expert/explorer/testnet).

### Option A: Render (recommended, free tier)

**Backend (Express + Tools):**
1. Push repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node start-services.js`  
   - **Environment:** Add all `.env` variables + set `BASE_URL` to your Render URL (e.g., `https://forge402-api.onrender.com`)
5. Deploy → Backend is live at `https://your-app.onrender.com`

**Frontend (Next.js):**
1. Go to [vercel.com](https://vercel.com) → Import Project
2. Set root directory to `packages/dashboard`
3. Add env: `NEXT_PUBLIC_API_URL=https://your-backend.onrender.com`
4. Deploy → Dashboard is live

### Option B: Single VPS (Railway, DigitalOcean, etc.)

```bash
# On your server:
git clone https://github.com/your-repo/forge402.git
cd forge402 && npm install
cp .env.example .env  # configure keys

# Set production URL
# In .env: BASE_URL=https://your-domain.com

# Start everything
node start-services.js &
cd packages/dashboard && npm run build && npm start &
```

### Key environment vars for production

| Variable | Production Value |
|---|---|
| `BASE_URL` | `https://your-backend-url.com` (auto-rewrites all tool endpoints) |
| `REGISTRY_URL` | `https://your-backend-url.com` |
| `NEXT_PUBLIC_API_URL` | `https://your-backend-url.com` (for dashboard) |
| `ADMIN_KEY` | A strong, unique key |

### What stays the same in production
- Still uses **Stellar Testnet** — real transaction flow, verifiable on-chain
- Still uses **USDC (testnet)** — free to fund via Circle Faucet
- All x402 payments are real Stellar transactions
- Judges can click any TX hash → see it on Stellar Explorer

---

## License

MIT

## Built for Stellar Hacks 2026

