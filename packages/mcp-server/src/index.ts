/**
 * AgentHub MCP Server v5.1
 * 
 * AI Agent → AgentHub Platform interface.
 * 
 * AGENT CONFIG (only 2 env vars needed):
 *   AGENT_STELLAR_SECRET=SXXX...   — agent's own wallet (pays x402)
 *   AGENTHUB_URL=http://localhost:4000  — platform URL
 * 
 * Everything else (Venice AI, GitHub tokens, tool registry, etc.) is the
 * PLATFORM's responsibility. Agents just pay USDC and get results.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

// ─── Agent Configuration (only 2 env vars) ──────────────────────────────────
const AGENT_SECRET = process.env.AGENT_STELLAR_SECRET;
const AGENTHUB_URL = process.env.AGENTHUB_URL || "http://localhost:4000";
const NETWORK = "stellar:testnet";
const RPC_URL = "https://soroban-testnet.stellar.org";

if (!AGENT_SECRET) {
  console.error("❌ Set AGENT_STELLAR_SECRET (your Stellar wallet secret key)");
  console.error("   Get a testnet wallet: https://laboratory.stellar.org/#account-creator?network=test");
  process.exit(1);
}

// Create x402 client with the AGENT's own wallet
const signer = createEd25519Signer(AGENT_SECRET, NETWORK);
const walletAddress = signer.address;
const paymentClient = new x402Client().register(
  "stellar:*",
  new ExactStellarScheme(signer, { url: RPC_URL }),
);
const httpClient = new x402HTTPClient(paymentClient);
const paidFetch = wrapFetchWithPayment(fetch, httpClient);

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: "agenthub-mcp", version: "5.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "check_wallet",
      description: "Check YOUR Stellar wallet balance (XLM + USDC).",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "list_tools",
      description: "List all x402 tools on the AgentHub marketplace.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "execute_mission",
      description: "Give a goal. AgentHub's AI plans + pays for tools from YOUR wallet. Returns an intelligence report. Gateway fee: ~$0.10.",
      inputSchema: {
        type: "object",
        properties: {
          request: { type: "string", description: "Your request, e.g. 'Is VVV token safe?'" },
          max_budget: { type: "number", description: "Max USDC budget (default: 1.00)" },
        },
        required: ["request"],
      },
    },
    {
      name: "deploy_agent",
      description: "Deploy an autonomous sub-agent. It runs on a schedule, uses tools, produces reports. Base cost: $1.00 USDC via x402.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Agent name" },
          goal: { type: "string", description: "What the agent should do" },
          schedule_minutes: { type: "number", description: "Run interval in minutes (default: 60)" },
          credit_limit: { type: "number", description: "USDC credit limit for the agent (default: 1.00). Extra credits auto-topped up via x402." },
        },
        required: ["name", "goal"],
      },
    },
    {
      name: "list_my_agents",
      description: "List agents owned by YOUR wallet.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "topup_agent",
      description: "Add USDC credits to a deployed agent. Paid via x402 from YOUR wallet.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "Agent ID" },
          amount: { type: "number", description: "USDC to add (default: 0.50)" },
        },
        required: ["agent_id"],
      },
    },
    {
      name: "get_agent_report",
      description: "Get the latest report from a deployed agent.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "Agent ID" },
        },
        required: ["agent_id"],
      },
    },
    {
      name: "pause_agent",
      description: "Pause a running agent. It will stop executing scheduled runs.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "Agent ID to pause" },
        },
        required: ["agent_id"],
      },
    },
    {
      name: "resume_agent",
      description: "Resume a paused agent. It will start running on its schedule again.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "Agent ID to resume" },
        },
        required: ["agent_id"],
      },
    },
    {
      name: "delete_agent",
      description: "Permanently delete a deployed agent. Any remaining credits are forfeited.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "Agent ID to delete" },
        },
        required: ["agent_id"],
      },
    },
  ],
}));

// ─── Tool Handlers ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ─── check_wallet ────────────────────────────────────────────────────────
  if (name === "check_wallet") {
    try {
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${walletAddress}`);
      if (!res.ok) {
        return text(`Wallet ${walletAddress} not found. Fund it:\nhttps://friendbot.stellar.org/?addr=${walletAddress}`);
      }
      const data = await res.json();
      const xlm = data.balances?.find(b => b.asset_type === "native")?.balance || "0";
      const usdc = data.balances?.find(b => b.asset_code === "USDC")?.balance || "0";
      return text(`Wallet: ${walletAddress}\nXLM: ${xlm}\nUSDC: ${usdc}\nNetwork: stellar:testnet`);
    } catch (e) {
      return text(`Error: ${e.message}`);
    }
  }

  // ─── list_tools ──────────────────────────────────────────────────────────
  if (name === "list_tools") {
    try {
      const res = await fetch(`${AGENTHUB_URL}/api/tools`);
      const data = await res.json();
      const tools = data.tools || [];
      const list = tools.map(t => `• ${t.name} ($${t.price} USDC) — ${t.description}`).join("\n");
      return text(`AgentHub Marketplace (${tools.length} tools):\n\n${list || "No tools registered."}`);
    } catch (e) {
      return text(`Error: ${e.message}`);
    }
  }

  // ─── execute_mission ─────────────────────────────────────────────────────
  if (name === "execute_mission") {
    try {
      const res = await paidFetch(`${AGENTHUB_URL}/api/mission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: args.request,
          max_budget: args.max_budget || 1.00,
          wallet: walletAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) return text(`❌ Mission failed: ${data.error || JSON.stringify(data)}`);

      const payments = data.payments || [];
      const paymentList = payments.map((p, i) =>
        `${i + 1}. ${p.service} ($${p.cost?.toFixed(2)}) TX: ${p.tx_hash?.slice(0, 12)}...`
      ).join("\n");

      return text(`🧠 INTELLIGENCE REPORT\n\n${data.report}\n\n💳 PAYMENTS (${payments.length} x402)\nSpent: $${data.budget?.spent?.toFixed(2) || "0.00"} / $${data.budget?.limit || "1.00"}\n${paymentList}`);
    } catch (e) {
      return text(`Mission failed: ${e.message}`);
    }
  }

  // ─── deploy_agent ────────────────────────────────────────────────────────
  if (name === "deploy_agent") {
    try {
      const creditLimit = args.credit_limit || 1.00;

      // Deploy via x402 ($1.00)
      const res = await paidFetch(`${AGENTHUB_URL}/api/agents/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: args.name,
          goal: args.goal,
          schedule_minutes: args.schedule_minutes || 60,
          owner_wallet: walletAddress,
          credit_limit: creditLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) return text(`❌ Deploy failed: ${data.error || JSON.stringify(data)}`);

      const agent = data.agent;
      let currentCredits = agent.credit_balance || 1.00;

      // Auto top-up if credit_limit > $1.00
      if (creditLimit > currentCredits) {
        const needed = creditLimit - currentCredits;
        const topups = Math.ceil(needed / 0.50);
        let topped = 0;
        for (let i = 0; i < topups; i++) {
          try {
            const tr = await paidFetch(`${AGENTHUB_URL}/api/agents/topup`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agent_id: agent.id }),
            });
            if (tr.ok) topped++;
          } catch {}
        }
        currentCredits += topped * 0.50;
      }

      return text(`✅ Agent deployed!\n\nName: ${agent.name}\nID: ${agent.id}\nOwner: ${walletAddress}\nGoal: ${agent.goal}\nSchedule: Every ${agent.schedule_minutes || 60} min\nCredits: $${currentCredits.toFixed(2)}\n\nPaid from your wallet via x402.`);
    } catch (e) {
      return text(`Deploy failed: ${e.message}`);
    }
  }

  // ─── list_my_agents ──────────────────────────────────────────────────────
  if (name === "list_my_agents") {
    try {
      const res = await fetch(`${AGENTHUB_URL}/api/agents?wallet=${walletAddress}`);
      const data = await res.json();
      const myAgents = (data.agents || []).filter(a => a.owner_wallet === walletAddress);
      if (myAgents.length === 0) return text(`No agents owned by ${walletAddress}.`);
      const list = myAgents.map(a =>
        `• ${a.name} [${a.status}] — ID: ${a.id}\n  Goal: ${a.goal?.slice(0, 80)}\n  Credits: $${a.credits_remaining?.toFixed(2)} | Runs: ${a.total_runs}`
      ).join("\n\n");
      return text(`Your Agents (${myAgents.length}):\n\n${list}`);
    } catch (e) {
      return text(`Error: ${e.message}`);
    }
  }

  // ─── topup_agent ─────────────────────────────────────────────────────────
  if (name === "topup_agent") {
    try {
      const amount = args.amount || 0.50;
      const topups = Math.ceil(amount / 0.50);
      let totalAdded = 0;
      let lastMessage = "";

      for (let i = 0; i < topups; i++) {
        const res = await paidFetch(`${AGENTHUB_URL}/api/agents/topup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: args.agent_id }),
        });
        const data = await res.json();
        if (res.ok) {
          totalAdded += 0.50;
          lastMessage = data.message || "";
        } else {
          return text(`❌ Top-up failed after $${totalAdded.toFixed(2)}: ${data.error}`);
        }
      }
      return text(`✅ Added $${totalAdded.toFixed(2)} credits to agent ${args.agent_id}.\n${lastMessage}`);
    } catch (e) {
      return text(`Top-up failed: ${e.message}`);
    }
  }

  // ─── get_agent_report ────────────────────────────────────────────────────
  if (name === "get_agent_report") {
    try {
      const res = await fetch(`${AGENTHUB_URL}/api/agents/${args.agent_id}`);
      const data = await res.json();
      if (!data.agent) return text("Agent not found.");
      const agent = data.agent;
      const lastReport = (agent.reports || []).slice(-1)[0];
      return text(`Agent: ${agent.name} [${agent.status}]\nCredits: $${agent.credits_remaining?.toFixed(2)} | Runs: ${agent.total_runs}\n\n${lastReport ? `Latest Report:\n${lastReport.report}` : "No reports yet."}`);
    } catch (e) {
      return text(`Error: ${e.message}`);
    }
  }

  // ─── pause_agent ─────────────────────────────────────────────────────────
  if (name === "pause_agent") {
    try {
      const res = await fetch(`${AGENTHUB_URL}/api/agents/${args.agent_id}/pause`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Wallet": walletAddress },
      });
      const data = await res.json();
      return text(res.ok ? `⏸️ Agent ${args.agent_id} paused.` : `❌ ${data.error}`);
    } catch (e) {
      return text(`Error: ${e.message}`);
    }
  }

  // ─── resume_agent ────────────────────────────────────────────────────────
  if (name === "resume_agent") {
    try {
      const res = await fetch(`${AGENTHUB_URL}/api/agents/${args.agent_id}/resume`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Wallet": walletAddress },
      });
      const data = await res.json();
      return text(res.ok ? `▶️ Agent ${args.agent_id} resumed.` : `❌ ${data.error}`);
    } catch (e) {
      return text(`Error: ${e.message}`);
    }
  }

  // ─── delete_agent ────────────────────────────────────────────────────────
  if (name === "delete_agent") {
    try {
      const res = await fetch(`${AGENTHUB_URL}/api/agents/${args.agent_id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Wallet": walletAddress },
      });
      const data = await res.json();
      return text(res.ok ? `🗑️ Agent ${args.agent_id} deleted.` : `❌ ${data.error}`);
    } catch (e) {
      return text(`Error: ${e.message}`);
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Helper
function text(content) {
  return { content: [{ type: "text", text: content }] };
}

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`🧠 AgentHub MCP v5.1`);
  console.error(`   Wallet: ${walletAddress}`);
  console.error(`   Hub:    ${AGENTHUB_URL}`);
  console.error(`   Tools:  check_wallet, list_tools, execute_mission, deploy_agent,`);
  console.error(`           list_my_agents, topup_agent, get_agent_report,`);
  console.error(`           pause_agent, resume_agent, delete_agent`);
}

main().catch(console.error);
