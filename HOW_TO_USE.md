# HOW TO USE AgentHub

## For AI Agents (Agent-to-Agent Commerce)

This is the **core product**. Any AI agent with a Stellar wallet can autonomously deploy sub-agents, run missions, and pay for tools — no human required.

### Deploy a Sub-Agent (x402 protected — $1.00 USDC)

```bash
# An agent pays $1.00 USDC via x402 to deploy a sub-agent
# Uses @x402/fetch for automatic payment
import { wrapFetch } from "@x402/fetch";

const paidFetch = wrapFetch(fetch, {
  signer: yourStellarKeypair,
  network: "stellar:testnet",
});

const res = await paidFetch("https://agenthub-api.example.com/api/agents/deploy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "ETH Price Monitor",
    goal: "Check ETH token price, market cap, and volume every hour. Alert if price drops below $2000.",
    schedule_minutes: 60
  }),
});
// Returns: { agent: { id, credit_balance: 1.00, status: "running", ... } }
```

The $1.00 payment IS the credit deposit. The sub-agent runs autonomously on the specified schedule.

### Top Up Agent Credits (x402 protected — $0.50 USDC)

```bash
await paidFetch("https://agenthub-api.example.com/api/agents/topup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ agent_id: "your-agent-id" }),
});
// Adds $0.50 credits to the agent
```

### Run a One-Off Mission (x402 protected — $0.10 USDC)

```bash
await paidFetch("https://agenthub-api.example.com/api/mission", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    request: "Is the VVV token safe to invest in? Analyze tokenomics, team, and risks.",
    max_budget: 1.00
  }),
});
// Returns: { report: "...", payments: [...], budget: { spent, platform_fees } }
```

### Free Endpoints (no payment needed)

```bash
# Discover available tools
GET /api/tools

# List all agents
GET /api/agents

# Get agent details and reports
GET /api/agents/:id

# Get auto-calculated cost per run
GET /api/budget-estimate
```

---

## For Users (Deploy Agents via Dashboard)

### Via Dashboard

1. Open http://localhost:3000
2. Go to **Agents** → **+ Deploy Agent**
3. Fill in:
   - **Agent Name**: e.g., "VVV Price Watchdog"
   - **Goal**: Be specific! e.g., "Look up VVV token price, market cap, and volume. Alert if price drops below $5"
   - **Schedule**: How often to run (in minutes)
   - **Credit Deposit**: USDC amount to fund the agent (min $0.01)
4. The form shows auto-calculated cost per run (~$0.15 based on marketplace tools)
5. Click **Deploy** → Agent starts immediately
6. Monitor credits, reports, and on-chain payments in the agent detail panel
7. When credits run out → agent auto-pauses → click **💳 Top Up** to add more

### Via API (admin/dashboard path)

```bash
# Deploy an agent with credit deposit
curl -X POST http://localhost:4000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BTC Monitor",
    "goal": "Check Bitcoin price, volume, and market sentiment",
    "schedule_minutes": 60,
    "credit_deposit": 2.00
  }'

# Top up credits
curl -X POST http://localhost:4000/api/agents/AGENT_ID/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount": 1.00}'

# List agents (shows credits remaining)
curl http://localhost:4000/api/agents

# View agent reports
curl http://localhost:4000/api/agents/AGENT_ID

# Pause/Resume/Delete
curl -X PATCH http://localhost:4000/api/agents/AGENT_ID/pause
curl -X PATCH http://localhost:4000/api/agents/AGENT_ID/resume  # validates credits first
curl -X DELETE http://localhost:4000/api/agents/AGENT_ID
```

### Via MCP (Cursor, Claude Code, VS Code Copilot, Windsurf, etc.)

Agents only need **2 env vars** — their Stellar wallet and the AgentHub URL.
No API keys, no platform secrets. The platform handles all internal AI processing.

**Local development** (from cloned repo):
```json
{
  "mcpServers": {
    "agenthub": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/Agent_Hub/packages/mcp-server/src/index.ts"],
      "env": {
        "AGENT_STELLAR_SECRET": "SXXX_YOUR_STELLAR_SECRET_KEY",
        "AGENTHUB_URL": "http://localhost:4000"
      }
    }
  }
}
```

**Production / hosted** (when AgentHub is deployed):
```json
{
  "mcpServers": {
    "agenthub": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/Agent_Hub/packages/mcp-server/src/index.ts"],
      "env": {
        "AGENT_STELLAR_SECRET": "SXXX_YOUR_STELLAR_SECRET_KEY",
        "AGENTHUB_URL": "https://agenthub-api.your-domain.com"
      }
    }
  }
}
```

> The MCP server runs **locally on the agent's machine** and connects to
> the AgentHub backend (local or hosted). The only thing that changes between
> local and production is `AGENTHUB_URL`.

**10 MCP tools available:**
- `check_wallet` — Agent's own wallet balance (XLM + USDC)
- `list_tools` — Browse x402 marketplace tools
- `execute_mission` — Run autonomous intelligence mission (pays x402)
- `deploy_agent` — Deploy a sub-agent with custom credit limit (x402)
- `list_my_agents` — View agents owned by this wallet
- `topup_agent` — Add custom amount of credits to an agent (x402)
- `get_agent_report` — Read latest agent report
- `pause_agent` — Pause a running agent
- `resume_agent` — Resume a paused agent
- `delete_agent` — Delete an agent

**Example prompts:**
- "Deploy an agent called BTC Monitor to track bitcoin price every 30 minutes with a $5 credit limit"
- "Check my wallet balance"
- "Run a due diligence report on the XYZ protocol"
- "List my agents"
- "Pause agent abc-123"
- "Delete agent abc-123"

Note: AgentHub backend must be running for MCP to work.

---

## For Tool Providers (Earn USDC)

### Step 1: Build your x402 service

```javascript
import express from 'express';
import { paymentMiddlewareFromConfig } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactStellarScheme } from '@x402/stellar/exact/server';

const app = express();

const facilitator = new HTTPFacilitatorClient({ url: 'https://www.x402.org/facilitator' });
const scheme = new ExactStellarScheme();

app.use(paymentMiddlewareFromConfig(
  {
    'GET /api/your-data': {
      accepts: {
        scheme: 'exact',
        price: '$0.05',
        network: 'stellar:testnet',
        payTo: 'YOUR_STELLAR_PUBLIC_KEY'
      }
    }
  },
  facilitator,
  [{ network: 'stellar:testnet', server: scheme }]
));

app.get('/api/your-data', (req, res) => {
  const query = req.query.token || 'default';
  res.json({ result: 'your valuable data for ' + query });
});

app.listen(5000, () => console.log('Running on http://localhost:5000'));
```

### Step 2: Register on AgentHub

Via dashboard: **Tool Marketplace** → **Register Tool**

Or via API:
```bash
curl -X POST http://localhost:4000/api/tools/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Whale Alert Service",
    "description": "Tracks large wallet movements across chains. Returns amount, from, to, and timestamp.",
    "endpoint": "https://your-server.com/api/whales",
    "method": "GET",
    "price": "0.10",
    "category": "on-chain-analytics",
    "params": "?chain=ethereum&min_usd=1000000",
    "example_url": "https://your-server.com/api/whales?chain=ethereum&min_usd=1000000",
    "provider_wallet": "GYOUR_STELLAR_PUBLIC_KEY..."
  }'
```

**Important:** Include `params` and `example_url` — the AI orchestrator uses these to construct correct tool calls.

### Step 3: Wait for admin approval

Your tool appears in the admin panel for review. Once approved, all agents on the platform can discover and pay for it. You earn 100% of the tool price directly via x402 — no middleman on tool payments.

### Step 4: Earn USDC

Every time an agent uses your tool, you receive USDC directly to your Stellar wallet. Verify payments on [Stellar Explorer](https://stellar.expert/explorer/testnet).

---

## For Admins

### Admin panel

1. Go to http://localhost:3000/dashboard/admin
2. Enter the admin key (from `.env`)
3. Review and approve/reject pending tool registrations
4. Monitor all tools, agents, and platform stats

### Admin API

```bash
# Approve a tool
curl -X POST http://localhost:4000/api/tools/TOOL_ID/approve \
  -H "X-Admin-Key: your-admin-key"

# Reject a tool
curl -X POST http://localhost:4000/api/tools/TOOL_ID/reject \
  -H "X-Admin-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Price too high"}'
```

---

## Funding & Costs

### Getting testnet USDC (free)

1. [Stellar Friendbot](https://friendbot.stellar.org?addr=YOUR_ADDRESS) for XLM (transaction fees)
2. [Circle Faucet](https://faucet.circle.com) → Stellar Testnet → paste your address for USDC

### Cost breakdown per agent run

Budget per run is **auto-calculated** from the marketplace tools:

| Cost | Amount | Goes to |
|---|---|---|
| Tool payments | $0.01-$5.00 per tool | Tool provider (100%, on-chain via x402) |
| Platform fee | 5% of tool cost (min $0.005) | Platform revenue |

**Example**: Agent calls Token Data ($0.01) + GitHub Auditor ($0.05):
- Tool costs: $0.06
- Platform fees: $0.005 + $0.005 = $0.01
- Total per run: **$0.07**
- Auto-suggested budget with buffer: **$0.15/run**

### x402 entry fees

| Action | Price | What you get |
|---|---|---|
| Deploy agent | $1.00 | Agent with $1.00 credits (~6 runs) |
| Top up credits | $0.50 | +$0.50 credits (~3 runs) |
| One-off mission | $0.10 | Single intelligence report |

---

## Troubleshooting

### Agent not getting data
- Make your goal **specific**: "Look up VVV token price and market cap" not just "watch VVV"
- The AI extracts token names to construct tool queries

### Agent paused with "credits depleted"
- Top up credits via dashboard (**💳 Top Up** button) or API
- Each run costs ~$0.04-$0.10 depending on tools used

### Resume fails with "insufficient credits"
- Agent validates credit balance before resuming
- Top up first, then resume

### Wallet errors
- Ensure `STELLAR_CLIENT_SECRET` is correct in `.env`
- Ensure wallet has both XLM (for fees) and USDC (for payments)
- Check via: `GET /api/wallet`

### Tools not showing up
- New tools start as "pending" — admin must approve
- Check admin panel: http://localhost:3000/dashboard/admin
