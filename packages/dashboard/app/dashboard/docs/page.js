'use client';
import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const sections = [
  {
    title: '🚀 Getting Started',
    audience: 'human',
    content: `## Getting Started with Forge402

### 1. Install Freighter Wallet
Download [Freighter](https://freighter.app) browser extension — this is your Stellar wallet.

### 2. Export your Freighter Secret Key
Your AI agent needs to sign on-chain x402 transactions autonomously. You must provide it a secret key.
1. Open Freighter → click **Settings** (gear icon) -> click your connected account.
2. Select **Export Secret Key**. 
3. (Optional) If you use CLI, you can extract the running account using stellar-cli by running \`stellar keys show\`.
4. Keep this key safe. Do not commit it.

### 3. Fund your wallet (Testnet)
- **XLM**: Visit [Friendbot](https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY)
- **USDC**: Visit [Circle Faucet](https://faucet.circle.com) → select Stellar Testnet

### 4. Connect inside the UI
1. Start the services locally or visit your hosted URL.
2. In the top navigation bar, click the **Connect Wallet** button.
3. The Freighter popup will appear. Approve the connection.
4. You are now authenticated to interact with the platform natively.

### 5. Step-by-Step: Deploy an Agent
1. Navigate to the **Agents** tab on the left sidebar.
2. Click the **+ Deploy Agent** button.
3. Fill in the required fields:
   - **Agent Name**: Give your agent a recognizable name.
   - **Goal**: Be highly specific! (ex: "Scan CoinGecko for VVV token trends every 12 hours").
   - **Schedule**: Define how often the agent should wake up and run.
   - **Credit Deposit**: Specify the amount of USDC to deposit linearly from your Freighter wallet to fund the agent.
4. Click **Deploy**. The agent is instantly live and scheduled!

### 6. Step-by-Step: Top Up Credits & Pause Agents
An agent is constrained by its escrowed credits.
1. When credits deplete, the agent will **Auto-Pause**. 
2. In the **Agents** tab, locate the paused agent and click **💳 Top Up**.
3. Confirm the top-up amount and sign the transaction. 
4. Click the **Resume** button to continue autonomous operations.

### 7. Step-by-Step: Using & Registering Tools
1. Navigate to the **Marketplace** tab.
2. Browse active tools available for your Agents to utilize.
3. To add your own API: Click **Register Tool**, fill in your API URL, Description, and Price.
4. Your API will be queued for Admin approval. Once active, other Agents will pay you USDC per request directly to your configured wallet!`
  },
  {
    title: '🤖 For AI Agents',
    audience: 'agent',
    content: `## Agent Integration Guide

Forge402 provides **three** ways for agents to interact:

### Option 1: MCP (Model Context Protocol)
Best for IDE-based agents (Cursor, Claude Code, VS Code, Windsurf).

Add to your MCP config:
\`\`\`json
{
  "mcpServers": {
    "forge402": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/Forge402/packages/mcp-server/src/index.ts"],
      "env": {
        "AGENT_STELLAR_SECRET": "SXXX_YOUR_SECRET",
        "AGENTHUB_URL": "${API_BASE}"
      }
    }
  }
}
\`\`\`

**Available MCP Tools:**
| Tool | Cost | Description |
|------|------|-------------|
| check_wallet | Free | Check XLM + USDC balance |
| list_tools | Free | Browse marketplace |
| list_my_agents | Free | View deployed agents |
| get_agent_report | Free | Read latest report |
| execute_mission | $0.10 | Run intelligence mission |
| deploy_agent | $1.00 | Deploy a sub-agent |
| topup_agent | $0.50 | Add credits to agent |
| pause_agent | Free | Pause running agent |
| resume_agent | Free | Resume paused agent |
| delete_agent | Free | Delete an agent |

### Option 2: Direct A2A (Agent-to-Agent Endpoint)
For agents dynamically discovering APIs natively, you can read the \`agent.json\` mapping to automatically digest capabilities, followed by reading the \`skill.md\` API guide.

**Step 1: Read the Agent JSON mapping**
\`\`\`bash
curl -s ${API_BASE}/.well-known/agent.json
\`\`\`
*(This will return a structured JSON mapping of skills, pricing, and auth formats)*

**Step 2: Read the Skills Blueprint**
\`\`\`bash
curl -s ${API_BASE}/skill.md
\`\`\`
*(This will map out the precise API endpoints, headers, and payload structures for interacting natively)*

### Option 3: Context Indexing via \`llms.txt\`
For agents needing a high-level conceptual summary before operating:
\`\`\`bash
curl -s ${API_BASE}/llms.txt
\`\`\`
Returns a complete knowledge file encompassing endpoint docs, costs, and high-level platform overviews.

### Option 4: Direct HTTP + x402
For programmatic agents using x402 payments directly:
\`\`\`bash
# Deploy a sub-agent ($1.00 USDC via x402)
POST ${API_BASE}/api/agents/deploy
Body: { "name": "...", "goal": "...", "schedule_minutes": 60 }

# Run a mission ($0.10 USDC via x402)
POST ${API_BASE}/api/mission
Body: { "request": "Analyze VVV token", "max_budget": 1.00 }
\`\`\``
  },
  {
    title: '🔧 Tool Marketplace',
    audience: 'human',
    content: `## Registering x402 Tools

Anyone can deploy an x402-protected service and register it on Forge402.

### Step 1: Create your x402 service

\`\`\`javascript
import express from 'express';
import { paymentMiddlewareFromConfig } from '@x402/express';

const app = express();

app.use(paymentMiddlewareFromConfig({
  'GET /api/your-data': {
    accepts: {
      scheme: 'exact',
      price: '$0.05',
      network: 'stellar:testnet',
      payTo: 'YOUR_STELLAR_WALLET'
    }
  }
}, facilitator, [{ network: 'stellar:testnet', server: scheme }]));

app.get('/api/your-data', (req, res) => {
  res.json({ data: 'your valuable data' });
});
\`\`\`

### Step 2: Register on Forge402

\`\`\`bash
curl -X POST ${API_BASE}/api/tools/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My Data Service",
    "description": "What it does",
    "endpoint": "https://my-server.com/api/your-data",
    "method": "GET",
    "price": "0.05",
    "category": "market-data",
    "provider_wallet": "GXYZ..."
  }'
\`\`\`

### Step 3: Admin Approval
Your tool appears in the admin panel. Once approved, it's discoverable by all agents.

### Price Rules
- Maximum: $5.00 per request
- All payments settle in USDC on Stellar
- You receive USDC directly to your wallet`
  },
  {
    title: '⚡ Agent Lifecycle',
    audience: 'human',
    content: `## Agent Lifecycle

### Deploy
Agents can be deployed from the dashboard or via API/MCP.
Each agent needs: **name**, **goal**, **schedule** (minutes), and **credits** (USDC).

### What Happens Each Run
1. Venice AI reads the goal and plans which marketplace tools to use
2. Agent pays for each tool via x402 (USDC on Stellar)
3. If data reveals new leads (e.g., a GitHub URL), agent auto-triggers more tools
4. Venice AI synthesizes all data into an intelligence report
5. Report is stored and accessible via dashboard or API
6. SHA-256 attestation hash anchored on-chain

### Spending Guardrails
- Per-run budget: ~$0.07-$0.15 depending on tools
- If next tool would exceed budget → skipped
- Agent auto-pauses when credits deplete
- No overdraft possible

### Lifecycle Actions
| Action | Dashboard | MCP | API |
|--------|-----------|-----|-----|
| Deploy | ✅ Agents tab | deploy_agent | POST /api/agents |
| Pause | ✅ | pause_agent | PATCH /api/agents/:id/pause |
| Resume | ✅ | resume_agent | PATCH /api/agents/:id/resume |
| Top Up | ✅ | topup_agent | POST /api/agents/topup |
| Delete | ✅ | delete_agent | DELETE /api/agents/:id |
| Reports | ✅ | get_agent_report | GET /api/agents/:id |`
  },
  {
    title: '📡 API Reference',
    audience: 'agent',
    content: `## API Reference

Base URL: \`${API_BASE}\`

### Discovery (No Auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/tools | List approved tools |
| GET | /api/stats | Platform statistics |
| GET | /api/payments | Recent x402 payments |
| GET | /.well-known/agent.json | A2A agent card |
| GET | /llms.txt | Agent knowledge file |
| GET | /health | Health check |

### Agent Management (Session Auth)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/agents | Deploy agent (session) |
| GET | /api/agents | List your agents |
| GET | /api/agents/:id | Agent details + reports |
| PATCH | /api/agents/:id/pause | Pause agent |
| PATCH | /api/agents/:id/resume | Resume agent |
| DELETE | /api/agents/:id | Delete agent |

### x402 Paid Endpoints
| Method | Path | Cost | Description |
|--------|------|------|-------------|
| POST | /api/agents/deploy | $1.00 | Deploy sub-agent |
| POST | /api/mission | $0.10 | Run mission |
| POST | /api/agents/topup | $0.50 | Top up credits |

### Tool Registry
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/tools/register | None | Submit tool |
| GET | /api/tools/pending | Admin | Pending tools |
| POST | /api/tools/:id/approve | Admin | Approve tool |
| POST | /api/tools/:id/reject | Admin | Reject tool |

### Auth Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/auth/challenge | Get SEP-10 challenge |
| POST | /api/auth/verify | Verify signed challenge |
| POST | /api/wallet/deposit | Deposit USDC credits |`
  },
  {
    title: '🔐 x402 Protocol',
    audience: 'agent',
    content: `## How x402 Works

x402 is a pay-per-request protocol for machine-to-machine payments.

### Payment Flow
\`\`\`
1. Agent → POST /api/mission → 402 Payment Required
   Response includes: price, payTo wallet, network

2. Agent constructs Stellar USDC transfer
   Signs with private key (never leaves agent)

3. Agent → POST /api/mission + X-Payment header → 200 OK + data
   Facilitator settles USDC on Stellar (~5 sec)
\`\`\`

### Using @x402/fetch (Recommended)
\`\`\`javascript
import { wrapFetch } from "@x402/fetch";
const paidFetch = wrapFetch(fetch, {
  signer: stellarKeypair,
  network: "stellar:testnet",
});

const res = await paidFetch("${API_BASE}/api/mission", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    request: "Analyze BTC market trends",
    max_budget: 1.00
  }),
});
\`\`\`

### Security Properties
- **Non-custodial**: Private keys never leave the agent
- **Verifiable**: Every payment = on-chain Stellar TX
- **Instant**: ~5 second settlement
- **Micropayments**: $0.01 viable on Stellar
- **Standard**: HTTP 402 — works with any HTTP client`
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState(0);
  const [filter, setFilter] = useState('all'); // all, human, agent

  const filtered = filter === 'all' ? sections : sections.filter(s => s.audience === filter);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Documentation</h1>
        <p className="page-subtitle">For humans and AI agents — everything you need to use Forge402</p>
      </div>

      {/* Audience Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[
          { key: 'all', label: 'All', icon: '📖' },
          { key: 'human', label: 'For Humans', icon: '👤' },
          { key: 'agent', label: 'For Agents', icon: '🤖' },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setActiveSection(0); }}
            className={`btn ${filter === f.key ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12 }}>
            {f.icon} {f.label}
          </button>
        ))}

        <a href={`${API_BASE}/llms.txt`} target="_blank" rel="noopener"
          className="btn btn-secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
          📄 llms.txt
        </a>
        <a href={`${API_BASE}/.well-known/agent.json`} target="_blank" rel="noopener"
          className="btn btn-secondary" style={{ fontSize: 12 }}>
          🔗 A2A Card
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 20 }}>
        {/* Sidebar Nav */}
        <nav style={{ position: 'sticky', top: 28, alignSelf: 'start' }}>
          {filtered.map((s, i) => (
            <button key={i} onClick={() => setActiveSection(i)}
              className={`docs-nav-btn ${activeSection === i ? 'active' : ''}`}
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}>
              {s.title}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="docs-content">
          {filtered[activeSection] && (
            <>
              <div style={{ marginBottom: 16 }}>
                <span className={`badge ${filtered[activeSection].audience === 'agent' ? 'badge-blue' : 'badge-green'}`}>
                  {filtered[activeSection].audience === 'agent' ? '🤖 For Agents' : '👤 For Humans'}
                </span>
              </div>
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(filtered[activeSection].content) }} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function renderMarkdown(md) {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\| (.*) \|/g, (m) => {
      const cells = m.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) return '';
      const tag = cells.length > 0 && m.includes('Method') ? 'th' : 'td';
      return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>\s*){2,}/g, (m) => `<table>${m}</table>`)
    .replace(/^\d+\. (.*)/gm, '<li style="margin-bottom:6px">$1</li>')
    .replace(/^- (.*)/gm, '<li style="margin-bottom:3px;list-style:disc;margin-left:18px">$1</li>')
    .replace(/\n\n/g, '<br/><br/>');
}
