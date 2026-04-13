# AgentHub Architecture Document

## Overview

AgentHub is an autonomous x402 agent marketplace on Stellar. It enables AI agents (and humans) to discover, pay for, and aggregate data services without human intervention, with built-in spending guardrails, on-chain attestations, and admin-curated tools.

**Key Innovation**: Agent A pays $1 USDC to deploy Agent B, which autonomously discovers tools, negotiates prices, pays via x402, and delivers synthesized intelligence — all verifiable on Stellar Explorer.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ENTRY POINTS                            │
│                                                                 │
│  🤖 AI Agent (x402)       🔌 MCP (IDE)        🌐 Dashboard    │
│  POST /agents/deploy      deploy_agent         Browse tools     │
│  POST /agents/topup       execute_mission      Deploy agents    │
│  POST /mission            topup_agent          Run missions     │
│  (pays USDC on Stellar)   (pays USDC via x402) (human admin)   │
└────────────┬──────────────────┬──────────────────┬──────────────┘
             │                  │                  │
             ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND API (Express, Port 4000)                               │
│                                                                 │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐ │
│  │ 📋 REGISTRY      │  │ 🤖 AGENT DAEMON                    │ │
│  │                  │  │                                     │ │
│  │ Tool CRUD        │  │ x402 deploy: $1.00 = credit deposit │ │
│  │ Admin approval   │  │ x402 topup: $0.50 = more credits    │ │
│  │ Price cap: $5    │  │ Credit check before each run        │ │
│  │ Category tags    │  │ Auto-pause when credits depleted    │ │
│  │ Param metadata   │  │ Auto-budget from tool prices        │ │
│  │ JSON persistence │  │ Report storage + webhook notify     │ │
│  └──────────────────┘  └─────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🧠 ORCHESTRATOR (packages/core/orchestrator.js)             ││
│  │                                                             ││
│  │ 1. Venice AI (privacy-first) plans which tools to call      ││
│  │ 2. x402 auto-payment for each tool ($USDC → provider)      ││
│  │ 3. Adaptive: auto-triggers follow-up tools from data        ││
│  │ 4. Budget guardrails: abort if exceeding limit              ││
│  │ 5. Platform fee: 5% of tool costs (min $0.005)              ││
│  │ 6. Venice AI synthesizes final report                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🔗 ATTESTATION LAYER (packages/core/attestation.js)         ││
│  │                                                             ││
│  │ • SHA-256 attestation hash per mission                      ││
│  │ • Records: tools used, costs, tx hashes, timestamps         ││
│  │ • Verifiable via /api/attestations/:id/verify               ││
│  │ • Data shape mirrors Soroban registry contract              ││
│  │ • Attestation hash publishable on-chain                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 📊 PAYMENT FEED (packages/core/attestation.js)              ││
│  │                                                             ││
│  │ • Real-time log of all x402 payments                        ││
│  │ • GET /api/payments — live payment feed                     ││
│  │ • GET /api/payments/stats — aggregated stats                ││
│  │ • GET /api/missions — mission history                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  🌐 Gateway: POST /api/mission ($0.10 x402 paywall)           │
│  ❤️ Health: GET /health (Cloud Run liveness probe)             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
           x402 USDC (per request, ~5sec settlement)
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│  TOOL MARKETPLACE                                               │
│                                                                 │
│  Each tool is an independently deployed Express server          │
│  with @x402/express middleware protecting endpoints.            │
│                                                                 │
│  DEMO TOOLS (included):                                         │
│  ┌──────────────┐ ┌───────────────┐ ┌──────────────────┐       │
│  │ Token Data   │ │ GitHub Audit  │ │ Web Research     │       │
│  │ Port 4001    │ │ Port 4002     │ │ Port 4003        │       │
│  │ $0.01/req    │ │ $0.05/req     │ │ $0.02/req        │       │
│  │ CoinGecko    │ │ GitHub API    │ │ URL scraper      │       │
│  └──────────────┘ └───────────────┘ └──────────────────┘       │
│                                                                 │
│  THIRD-PARTY TOOLS (anyone can register):                       │
│  Deploy x402 server → register → admin approves → earn USDC    │
└─────────────────────────────────────────────────────────────────┘

SOROBAN SMART CONTRACTS (on-chain trust anchors):
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Registry Contract│  │ Escrow Contract  │                    │
│  │ • register_tool  │  │ • create_escrow  │                    │
│  │ • get_tool       │  │ • release_funds  │                    │
│  │ • attest_tool    │  │ • refund         │                    │
│  │ (reputation)     │  │ (task-based)     │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Money Flow

### Who pays whom?

```
USER DEPLOYS AGENT:
                                                     
  1. User sends USDC ──→ Platform Wallet (testnet)   
  2. User deploys agent with credit_deposit: $2.00    
                                                     
EACH AGENT RUN:
┌──────────────────┐                                  
│ Agent Credits     │                                  
│ ($2.00 deposited) │                                  
│                   ├──── tool cost ────→ Tool Provider Wallet (100% via x402)
│                   ├──── 5% fee ──────→ Platform Revenue (deducted from credits)
│                   │                                  
│ Remaining: $1.96  │  After 1 run costing $0.04       
│ Remaining: $0.00  │  ⛔ Auto-pauses, user tops up    
└──────────────────┘                                  

For EXTERNAL AGENTS (calling /api/mission):
┌──────────────┐
│ Agent's Own  │──── $0.10 x402 ──→ Platform Wallet (gateway fee)
│ Wallet       │                    
└──────────────┘
   Then platform orchestrator runs the mission using platform wallet.
```

### Revenue breakdown

| Component | Amount | Recipient | Triggered by |
|---|---|---|---|
| **Agent deployment** | $1.00 | Platform | Agent pays via x402 to deploy sub-agent |
| **Agent top-up** | $0.50 | Platform | Agent tops up credits via x402 |
| Gateway mission | $0.10 | Platform | External agent runs one-off mission |
| Orchestration fee | 5% of tool costs | Platform | Every tool call in a mission |
| Tool payments | $0.01-$0.05 each | Tool providers | 100% direct, on-chain via x402 |

---

## Security Model

### What we protect

| Threat | Mitigation |
|---|---|
| Private key exposure | Keys only in `.env` server-side. Never in API requests, UI, or responses. |
| Wallet draining | Per-mission budget limits. Per-tool price cap ($5). Auto-abort on overspend. |
| Malicious tools | Admin approval required. Price caps enforced on registration. |
| Over-charging | Budget guardrails track running costs and abort mid-mission if exceeded. |
| Secret in transit | Users never send secrets. Agents deploy with only: name, goal, schedule, budget. |

### x402 security properties
- **Non-custodial**: Private keys sign Soroban auth entries locally, never transmitted
- **Verifiable**: Every payment is an on-chain Stellar USDC transaction
- **Instant**: ~5 second settlement finality on Stellar
- **Auditable**: All TX hashes stored, linked to Stellar Explorer, and attested

### On-chain attestation properties
- **Tamper-proof**: SHA-256 hash of mission data (tools, costs, tx hashes)
- **Verifiable**: GET /api/attestations/:id/verify recomputes and validates the hash
- **Soroban-ready**: Attestation data shape mirrors the RegistryContract.attest_tool() function

---

## Data Storage

| Data | Storage | Location |
|---|---|---|
| Tool registry | JSON file | `data/registry.json` |
| Agent state + reports | JSON files (1 per agent) | `data/agents/*.json` |
| Payment event log | JSON file | `data/payments.json` |
| Mission attestations | JSON file | `data/attestations.json` |
| Mission history | JSON file | `data/missions.json` |
| Wallet keys | Environment variables | `.env` (server-side only) |
| Platform config | Environment variables | `.env` |

---

## Tool Registration Flow

```
Developer deploys x402 Express server
        │
        ▼
POST /api/tools/register
{ name, description, endpoint, method, price, params, example_url, provider_wallet }
        │
        ▼
Price validation (must be ≤ $5.00)
        │
        ▼
Status: "pending" → Admin reviews in dashboard
        │
        ▼
Admin approves → Status: "approved" → Tool visible to all agents
```

---

## Agent Lifecycle

```
POST /api/agents { name, goal, schedule_minutes, max_budget_per_run }
        │
        ▼
Agent created → first run immediately → report stored
        │
        ▼
Scheduled: runs every N minutes automatically
        │                              │
    PATCH /pause                   PATCH /resume
        │                              │
        ▼                              ▼
    Timer stopped                  Timer restarted
        │
    DELETE /agents/:id → Agent removed
```

### What happens each run

1. Agent timer fires
2. Credit balance checked — auto-pause if insufficient
3. `executeAutonomousMission(goal)` called with budget limit
4. Venice AI analyzes goal → plans which tools to hire
5. Each tool called via x402 paid fetch → USDC settles on Stellar
6. Adaptive: if new data found (GitHub URL, homepage), auto-triggers more tools
7. Venice AI synthesizes all data into report
8. **Attestation created** — SHA-256 hash of mission data stored
9. **Payments recorded** — each payment logged to live feed
10. Report stored with payment receipts and TX hashes
11. Webhook notification sent (if configured)

---

## Technology Stack

| Component | Technology |
|---|---|
| Backend | Express.js (Node 22+) |
| Frontend | Next.js 16, vanilla CSS (dark mode, glassmorphism) |
| AI | Venice AI API (llama-3.3-70b) — privacy-first |
| Payments | x402 protocol (@x402/fetch, @x402/express, @x402/stellar) |
| Blockchain | Stellar Testnet, USDC (Circle), Soroban |
| Trust Layer | SHA-256 attestations + Soroban smart contracts |
| IDE Integration | Model Context Protocol (MCP) |
| Data | JSON file persistence |
| Deployment | Google Cloud Run (backend) + Vercel (frontend) |

---

## API Reference

### x402-Protected (Agents pay USDC — no human required)
| Method | Endpoint | Price | Description |
|---|---|---|---|
| POST | `/api/agents/deploy` | $1.00 | Deploy a sub-agent |
| POST | `/api/agents/topup` | $0.50 | Top up agent credits |
| POST | `/api/mission` | $0.10 | Run a one-off intelligence mission |

### Free (No payment required)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check (Cloud Run liveness) |
| GET | `/api/tools` | List approved marketplace tools |
| POST | `/api/tools/register` | Register new tool (pending approval) |
| GET | `/api/budget-estimate` | Auto-calculated cost per run |
| GET | `/api/payments` | Live payment feed |
| GET | `/api/payments/stats` | Payment statistics |
| GET | `/api/attestations` | Mission attestations |
| GET | `/api/attestations/:id/verify` | Verify attestation hash |
| GET | `/api/missions` | Mission history |
| GET | `/api/wallet` | Platform wallet balance |
| GET | `/api/stats` | Platform statistics |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `VENICE_API_KEY` | Venice AI for orchestration planning + synthesis |
| `GITHUB_TOKEN` | GitHub API for the github-auditor tool |
| `STELLAR_CLIENT_SECRET` | Platform wallet private key (pays for tools) |
| `STELLAR_CLIENT_PUBLIC` | Platform wallet public address |
| `STELLAR_PROVIDER_SECRET` | Tool receiver wallet private key |
| `STELLAR_PROVIDER_PUBLIC` | Tool receiver wallet public address |
| `ADMIN_KEY` | Admin panel authentication key |
| `X402_FACILITATOR_URL` | x402 facilitator endpoint |
| `REGISTRY_URL` | Backend API URL (default: http://localhost:4000) |
| `BASE_URL` | Production backend URL (for URL rewriting) |
| `ALLOWED_ORIGINS` | CORS origins (default: *) |
| `PORT` | Server port (default: 4000, overridden by Cloud Run) |
