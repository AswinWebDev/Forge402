/**
 * Forge402 v5 — Unified Backend API
 * 
 * SECURITY MODEL:
 * - Identity = Stellar public key (wallet address)
 * - Dashboard auth: Challenge-response (SEP-10 inspired)
 * - Agent auth: x402 payment proves wallet ownership
 * - Deposits verified on-chain via Stellar Horizon API
 * - Session tokens: HMAC-signed, time-limited, server-verified
 * - No private keys accepted via API
 * - Platform wallet configured ONCE in .env (server-side only)
 * - All data scoped by owner_wallet
 * 
 * Port: 4000 (single backend)
 */
import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { executeAutonomousMission, getWalletInfo, getPlatformClient } from "../core/orchestrator.js";
import { getRecentPayments, getPaymentStats, getRecentAttestations, verifyAttestation } from "../core/attestation.js";
import {
  isValidStellarAddress, generateChallenge, verifyChallenge,
  verifySessionToken, getOrCreateAccount, getAccount, saveAccount,
  addCredits, deductCredits, getBalance, associateAgent, associateMission,
  verifyAndCreditDeposits, getWalletBalances, getWalletTransactions,
} from "../core/accounts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.ADMIN_KEY || "agenthub-admin-2026";
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://www.x402.org/facilitator";
const PAY_TO = process.env.STELLAR_PROVIDER_PUBLIC;
const NETWORK = "stellar:testnet";
const MAX_TOOL_PRICE = 5.00;
const BASE_URL = process.env.BASE_URL || "http://localhost";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "*";

// ─── Data Persistence ─────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, "../../data");
const REGISTRY_FILE = path.join(DATA_DIR, "registry.json");
const AGENTS_DIR = path.join(DATA_DIR, "agents");
const MISSIONS_FILE = path.join(DATA_DIR, "missions.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AGENTS_DIR)) fs.mkdirSync(AGENTS_DIR, { recursive: true });

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf-8")); }
  catch { return { tools: [] }; }
}
function saveRegistry(data) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}
function loadAgents() {
  try {
    const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".json"));
    return files.map(f => JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, f), "utf-8")));
  } catch { return []; }
}
function saveAgent(agent) {
  fs.writeFileSync(path.join(AGENTS_DIR, `${agent.id}.json`), JSON.stringify(agent, null, 2));
}
function deleteAgentFile(id) {
  try { fs.unlinkSync(path.join(AGENTS_DIR, `${id}.json`)); } catch {}
}
function loadMissions() {
  try { return JSON.parse(fs.readFileSync(MISSIONS_FILE, "utf-8")); }
  catch { return { missions: [] }; }
}
function saveMission(mission) {
  const store = loadMissions();
  store.missions.push(mission);
  if (store.missions.length > 100) store.missions = store.missions.slice(-100);
  fs.writeFileSync(MISSIONS_FILE, JSON.stringify(store, null, 2));
}

// ─── Agent Timers ────────────────────────────────────────────────────────────

const agentTimers = new Map();

function startAgentTimer(agent) {
  if (agentTimers.has(agent.id)) clearInterval(agentTimers.get(agent.id));

  const runAgent = async () => {
    const agents = loadAgents();
    const fresh = agents.find(a => a.id === agent.id);
    if (!fresh) return;
    Object.assign(agent, fresh);

    // Check the AGENT's own credit balance (credits allocated at deploy time)
    const agentCreditsRemaining = (agent.credit_balance || 0) - (agent.total_spent || 0);
    const runCost = agent.max_budget_per_run || 0.50;

    if (agentCreditsRemaining < runCost * 0.5) {
      console.log(`[Agent ${agent.name}] ⛔ Credits low ($${agentCreditsRemaining.toFixed(2)}). Auto-pausing.`);
      agent.status = "paused";
      agent.pause_reason = "insufficient_credits";
      saveAgent(agent);
      if (agentTimers.has(agent.id)) { clearInterval(agentTimers.get(agent.id)); agentTimers.delete(agent.id); }
      return;
    }

    console.log(`[Agent ${agent.name}] Running mission... (credits: $${agentCreditsRemaining.toFixed(2)})`);
    try {
      const result = await executeAutonomousMission(agent.goal, {
        maxBudget: Math.min(runCost, agentCreditsRemaining),
      });

      const report = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...result,
      };
      if (!agent.reports) agent.reports = [];
      agent.reports.push(report);
      agent.last_run = report.timestamp;
      agent.total_runs = (agent.total_runs || 0) + 1;
      agent.total_spent = (agent.total_spent || 0) + (result.budget?.spent || 0);
      saveAgent(agent);

      // Credits already tracked in agent.total_spent (deducted from agent.credit_balance)

      if (agent.webhook_url) {
        try {
          await fetch(agent.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agent_id: agent.id, agent_name: agent.name,
              report_summary: result.report?.slice(0, 500),
              spent: result.budget?.spent,
              owner_wallet: agent.owner_wallet,
              payments: result.payments?.length,
              timestamp: report.timestamp,
            }),
          });
        } catch {}
      }

      // Check if agent credits depleted after this run
      const newBalance = (agent.credit_balance || 0) - agent.total_spent;
      console.log(`[Agent ${agent.name}] Done. Cost: $${result.budget?.spent?.toFixed(2)} | Credits: $${newBalance.toFixed(2)}`);

      if (newBalance < runCost * 0.5) {
        console.log(`[Agent ${agent.name}] ⚠️ Credits low — auto-pausing.`);
        agent.status = "paused";
        agent.pause_reason = "credits_depleted";
        saveAgent(agent);
        if (agentTimers.has(agent.id)) { clearInterval(agentTimers.get(agent.id)); agentTimers.delete(agent.id); }
      }
    } catch (e) {
      console.error(`[Agent ${agent.name}] Error: ${e.message}`);
    }
  };

  runAgent();
  const interval = setInterval(runAgent, (agent.schedule_minutes || 60) * 60 * 1000);
  agentTimers.set(agent.id, interval);
}

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();

if (ALLOWED_ORIGINS === "*") { app.use(cors()); }
else { app.use(cors({ origin: ALLOWED_ORIGINS.split(",").map(s => s.trim()) })); }
app.use(express.json());

// Dynamic template rendering for discovery files
const serveDynamicTemplate = (filePath) => {
  return (req, res) => {
    try {
      const fullPath = path.join(__dirname, "../../public", filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Not found" });
      let content = fs.readFileSync(fullPath, "utf-8");
      // Replace placeholder with actual backend URL
      content = content.replace(/\{\{BASE_URL\}\}/g, BASE_URL);
      res.setHeader('Content-Type', filePath.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8');
      res.send(content);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
};

app.get("/llms.txt", serveDynamicTemplate("llms.txt"));
app.get("/skill.md", serveDynamicTemplate("skill.md"));
app.get("/.well-known/agent.json", serveDynamicTemplate(".well-known/agent.json"));

// Serve other static public files
app.use(express.static(path.join(__dirname, "../../public")));

// Health check (Cloud Run liveness probe)
app.get("/health", (_, res) => res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() }));

// Diagnostic: check internal tool services + external HTTPS connectivity
app.get("/health/tools", async (_, res) => {
  const checks = {};
  const testUrl = async (name, url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      checks[name] = { status: r.status, ok: true };
    } catch (e) {
      checks[name] = { error: e.message, ok: false };
    }
  };
  await Promise.all([
    testUrl("token-data (4001)", "http://localhost:4001/"),
    testUrl("github-auditor (4002)", "http://localhost:4002/"),
    testUrl("web-research (4003)", "http://localhost:4003/"),
    testUrl("coingecko", "https://api.coingecko.com/api/v3/ping"),
    testUrl("stellar-rpc", "https://soroban-testnet.stellar.org"),
    testUrl("x402-facilitator", FACILITATOR_URL),
  ]);
  res.json({ checks, all_ok: Object.values(checks).every(c => c.ok) });
});

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Invalid admin key" });
  next();
}

/**
 * Extract authenticated wallet from request.
 * Checks (in order):
 * 1. X-Session-Token header (dashboard auth)
 * 2. X-Wallet header (for read-only queries — no mutation allowed without session)
 * Returns null if no valid auth found.
 */
function getAuthWallet(req) {
  // 1. Session token (most secure — proves wallet ownership)
  const token = req.headers["x-session-token"];
  if (token) {
    const session = verifySessionToken(token);
    if (session) return { wallet: session.wallet, method: "session", verified: true };
  }

  // 2. X-Wallet header (for read-only queries)
  const wallet = req.headers["x-wallet"] || req.query.wallet;
  if (wallet && isValidStellarAddress(wallet)) {
    return { wallet, method: "header", verified: false };
  }

  return null;
}

/**
 * Require wallet authentication for mutations.
 * Only session-token auth is accepted (proves wallet ownership).
 */
function requireAuth(req, res, next) {
  const auth = getAuthWallet(req);
  if (!auth) return res.status(401).json({ error: "Authentication required. Connect your Stellar wallet first." });
  if (!auth.verified) return res.status(401).json({ error: "Session token required for this action. Use POST /api/auth/challenge + /api/auth/verify first." });
  req.wallet = auth.wallet;
  next();
}

/**
 * Optional wallet context — for filtering queries.
 */
function optionalWallet(req, res, next) {
  const auth = getAuthWallet(req);
  req.wallet = auth?.wallet || null;
  req.walletVerified = auth?.verified || false;
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION (Challenge-Response, SEP-10 inspired)
// ═══════════════════════════════════════════════════════════════════════════════

// Step 1: Request a challenge (SEP-10 transaction)
app.post("/api/auth/challenge", (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "Provide { wallet: 'GXXX...' }" });

  try {
    const challenge = generateChallenge(wallet);
    res.json({
      ...challenge,
      message: "Sign this transaction with your Stellar wallet. The transaction is never submitted — it's only used to prove wallet ownership.",
      platform_wallet: PAY_TO,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Step 2: Verify signed challenge transaction → get session token
app.post("/api/auth/verify", (req, res) => {
  const { wallet, signedXDR } = req.body;
  if (!wallet || !signedXDR) return res.status(400).json({ error: "Provide { wallet, signedXDR }" });

  try {
    const session = verifyChallenge(wallet, signedXDR);
    // Ensure account exists
    getOrCreateAccount(wallet);
    res.json({
      ...session,
      message: "Authenticated via SEP-10 transaction signing. Use this token in X-Session-Token header.",
      account: getAccount(wallet),
    });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

// Quick connect (for demo/hackathon — creates account, returns info, no sig required for READ access)
app.post("/api/auth/connect", (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "Provide { wallet: 'GXXX...' }" });
  if (!isValidStellarAddress(wallet)) return res.status(400).json({ error: "Invalid Stellar address" });

  const account = getOrCreateAccount(wallet);
  res.json({
    wallet,
    account,
    platform_wallet: PAY_TO,
    message: "Wallet connected. For full auth (mutations), use challenge-response flow. For deposits, send USDC to the platform wallet and call /api/auth/verify-deposit.",
  });
});

// Verify deposits on-chain
app.post("/api/auth/verify-deposit", async (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "Provide { wallet }" });

  try {
    const result = await verifyAndCreditDeposits(wallet);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Credit account by verifying a specific submitted transaction hash
app.post("/api/auth/credit-tx", requireAuth, async (req, res) => {
  const { txHash } = req.body;
  const wallet = req.wallet;
  if (!txHash) return res.status(400).json({ error: "Provide { txHash }" });

  try {
    // Check if already credited
    const account = getOrCreateAccount(wallet);
    if (account.deposits.find(d => d.tx_hash === txHash)) {
      return res.json({ 
        already_credited: true,
        balance: account.balance,
        message: "This transaction was already credited.",
      });
    }

    // Verify the transaction on Horizon
    const txRes = await fetch(`https://horizon-testnet.stellar.org/transactions/${txHash}/operations`);
    if (!txRes.ok) throw new Error("Transaction not found on Stellar network. Wait a few seconds and try again.");
    const txData = await txRes.json();
    const ops = txData._embedded?.records || [];
    
    // Find a USDC payment from this wallet to the platform wallet
    const platformWallet = process.env.STELLAR_PROVIDER_PUBLIC;
    const payment = ops.find(op => 
      op.type === "payment" &&
      op.from === wallet &&
      op.to === platformWallet &&
      op.asset_code === "USDC"
    );

    if (!payment) {
      throw new Error("No USDC payment to platform wallet found in this transaction.");
    }

    const amount = parseFloat(payment.amount);
    if (amount <= 0) throw new Error("Payment amount must be positive.");

    // Credit the account
    addCredits(wallet, amount, txHash, "dashboard_deposit");
    const updated = getAccount(wallet);

    res.json({
      credited: true,
      amount,
      txHash,
      balance: updated.balance,
      total_deposited: updated.total_deposited,
      message: `$${amount.toFixed(2)} USDC deposited and credited.`,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get account info
app.get("/api/account/:wallet", async (req, res) => {
  const wallet = req.params.wallet;
  if (!isValidStellarAddress(wallet)) return res.status(400).json({ error: "Invalid Stellar address" });

  const account = getAccount(wallet);
  if (!account) return res.status(404).json({ error: "Account not found. Connect wallet first." });

  // Also get on-chain balances
  let onChain = null;
  try { onChain = await getWalletBalances(wallet); } catch {}

  res.json({
    account,
    on_chain: onChain,
    agents: loadAgents().filter(a => a.owner_wallet === wallet).map(a => ({
      id: a.id, name: a.name, status: a.status, total_runs: a.total_runs, total_spent: a.total_spent,
    })),
  });
});

// Get on-chain wallet balances
app.get("/api/account/:wallet/balances", async (req, res) => {
  try {
    res.json(await getWalletBalances(req.params.wallet));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get on-chain transactions
app.get("/api/account/:wallet/transactions", async (req, res) => {
  try {
    res.json({ transactions: await getWalletTransactions(req.params.wallet) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL REGISTRY (curated marketplace)
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/api/tools", (_, res) => {
  const { tools } = loadRegistry();
  // Only return approved tools publicly (no internal fields)
  const approved = tools.filter(t => t.status === "approved").map(t => ({
    id: t.id, name: t.name, description: t.description, endpoint: t.endpoint,
    method: t.method, price: t.price, category: t.category, params: t.params,
    example_url: t.example_url, provider_wallet: t.provider_wallet,
  }));
  res.json({ tools: approved, count: approved.length });
});

app.get("/api/tools/pending", requireAdmin, (_, res) => {
  const { tools } = loadRegistry();
  res.json({ tools: tools.filter(t => t.status === "pending") });
});

app.get("/api/tools/all", requireAdmin, (_, res) => {
  const { tools } = loadRegistry();
  res.json({ tools, count: tools.length });
});

app.post("/api/tools/register", (req, res) => {
  const { name, description, endpoint, method, price, category, provider_wallet, contact, params, example_url } = req.body;

  if (!name || !description || !endpoint || !price) {
    return res.status(400).json({ error: "Required: name, description, endpoint, price" });
  }

  // Validate provider wallet if provided
  if (provider_wallet && !isValidStellarAddress(provider_wallet)) {
    return res.status(400).json({ error: "Invalid provider_wallet. Must be a valid Stellar public key (G...)." });
  }

  const priceNum = parseFloat(String(price).replace(/[^0-9.]/g, ""));
  if (priceNum > MAX_TOOL_PRICE) {
    return res.status(400).json({ error: `Price exceeds max cap of $${MAX_TOOL_PRICE}` });
  }

  const tool = {
    id: crypto.randomUUID(),
    name, description, endpoint,
    method: method || "GET",
    price: `$${priceNum.toFixed(2)}`,
    category: category || "general",
    params: params || "",
    example_url: example_url || "",
    provider_wallet: provider_wallet || "unknown",
    contact: contact || "unknown",
    status: "pending",
    registered_at: new Date().toISOString(),
  };

  const registry = loadRegistry();
  registry.tools.push(tool);
  saveRegistry(registry);
  res.status(201).json({ message: "Tool registered. Pending admin approval.", tool });
});

app.post("/api/tools/:id/approve", requireAdmin, (req, res) => {
  const registry = loadRegistry();
  const tool = registry.tools.find(t => t.id === req.params.id);
  if (!tool) return res.status(404).json({ error: "Tool not found" });
  tool.status = "approved";
  tool.approved_at = new Date().toISOString();
  saveRegistry(registry);
  res.json({ message: "Tool approved", tool });
});

app.post("/api/tools/:id/reject", requireAdmin, (req, res) => {
  const registry = loadRegistry();
  const tool = registry.tools.find(t => t.id === req.params.id);
  if (!tool) return res.status(404).json({ error: "Tool not found" });
  tool.status = "rejected";
  tool.rejected_at = new Date().toISOString();
  tool.rejection_reason = req.body.reason || "Not specified";
  saveRegistry(registry);
  res.json({ message: "Tool rejected", tool });
});

app.delete("/api/tools/:id", requireAdmin, (req, res) => {
  const registry = loadRegistry();
  registry.tools = registry.tools.filter(t => t.id !== req.params.id);
  saveRegistry(registry);
  res.json({ message: "Tool removed" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTONOMOUS AGENTS (wallet-scoped, credit-based)
// ═══════════════════════════════════════════════════════════════════════════════

function estimateBudgetPerRun() {
  const { tools } = loadRegistry();
  const approved = tools.filter(t => t.status === "approved");
  let totalToolCost = 0, totalFees = 0;
  for (const t of approved) {
    const price = parseFloat(String(t.price).replace(/[^0-9.]/g, "")) || 0;
    totalToolCost += price;
    totalFees += Math.max(price * 0.05, 0.005);
  }
  const raw = totalToolCost + totalFees;
  return { tool_costs: totalToolCost, platform_fees: totalFees, estimated: raw, suggested: Math.ceil(raw * 1.5 * 100) / 100, tool_count: approved.length };
}

app.get("/api/budget-estimate", (_, res) => res.json(estimateBudgetPerRun()));

// Deploy agent (dashboard — uses session auth + credits)
app.post("/api/agents", requireAuth, (req, res) => {
  const { name, goal, schedule_minutes, max_budget_per_run, credit_deposit, webhook_url } = req.body;

  if (!name || !goal) return res.status(400).json({ error: "Required: name, goal" });

  // Determine owner wallet
  const ownerWallet = req.wallet || req.body.wallet;
  if (!ownerWallet || !isValidStellarAddress(ownerWallet)) {
    return res.status(400).json({
      error: "Connect your Stellar wallet first. Provide wallet via X-Wallet header, X-Session-Token, or wallet field.",
    });
  }

  const deposit = Number(credit_deposit) || 0;
  const ownerBalance = getBalance(ownerWallet);

  // If deposit specified, check if owner has enough credits
  if (deposit > 0 && ownerBalance < deposit) {
    return res.status(400).json({
      error: `Insufficient credits. Balance: $${ownerBalance.toFixed(2)}, requested deposit: $${deposit.toFixed(2)}. Send USDC to ${PAY_TO} and verify your deposit.`,
      balance: ownerBalance,
      platform_wallet: PAY_TO,
    });
  }

  let platformWallet;
  try { platformWallet = getPlatformClient().walletAddress; }
  catch { return res.status(500).json({ error: "Platform wallet not configured" }); }

  const budget = estimateBudgetPerRun();
  const budgetPerRun = max_budget_per_run ? Number(max_budget_per_run) : budget.suggested;
  const creditAmount = deposit > 0 ? deposit : budgetPerRun; // default: enough for 1 run

  // Deduct credits from owner's account
  if (deposit > 0) {
    try { deductCredits(ownerWallet, deposit, "agent_deploy"); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }

  const agent = {
    id: crypto.randomUUID(),
    name, goal,
    owner_wallet: ownerWallet,
    schedule_minutes: schedule_minutes || 60,
    max_budget_per_run: budgetPerRun,
    credit_balance: creditAmount,
    wallet_address: platformWallet,
    webhook_url: webhook_url || null,
    status: "running",
    deployed_via: "dashboard",
    created_at: new Date().toISOString(),
    last_run: null,
    total_runs: 0,
    total_spent: 0,
    reports: [],
  };

  saveAgent(agent);
  associateAgent(ownerWallet, agent.id);
  startAgentTimer(agent);

  res.status(201).json({
    message: `Agent deployed. Credits: $${creditAmount.toFixed(2)}`,
    agent: {
      id: agent.id, name: agent.name, goal: agent.goal,
      owner_wallet: agent.owner_wallet,
      schedule_minutes: agent.schedule_minutes,
      max_budget_per_run: agent.max_budget_per_run,
      credit_balance: agent.credit_balance,
      credits_remaining: creditAmount,
      status: agent.status,
    },
  });
});

// Top up agent credits (dashboard)
app.post("/api/agents/:id/deposit", requireAuth, (req, res) => {
  const agents = loadAgents();
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  // Verify ownership
  const callerWallet = req.wallet || req.body.wallet;
  if (agent.owner_wallet && callerWallet !== agent.owner_wallet) {
    return res.status(403).json({ error: "You don't own this agent." });
  }

  const amount = Number(req.body.amount);
  if (!amount || amount < 0.01) return res.status(400).json({ error: "Deposit amount required (min $0.01)" });

  // Check owner has enough credits
  if (callerWallet) {
    const balance = getBalance(callerWallet);
    if (balance < amount) {
      return res.status(400).json({ error: `Insufficient credits. Balance: $${balance.toFixed(2)}` });
    }
    deductCredits(callerWallet, amount, `agent_topup:${agent.id}`);
  }

  agent.credit_balance = (agent.credit_balance || 0) + amount;
  saveAgent(agent);

  const remaining = agent.credit_balance - (agent.total_spent || 0);
  res.json({
    message: `$${amount.toFixed(2)} added. Credits: $${agent.credit_balance.toFixed(2)}, remaining: $${remaining.toFixed(2)}`,
    credit_balance: agent.credit_balance,
    credits_remaining: remaining,
  });
});

// List agents (filtered by wallet)
app.get("/api/agents", optionalWallet, (req, res) => {
  let agents = loadAgents();

  // Filter by wallet if provided
  const filterWallet = req.wallet || req.query.wallet;
  if (filterWallet && isValidStellarAddress(filterWallet)) {
    agents = agents.filter(a => a.owner_wallet === filterWallet);
  }

  const mapped = agents.map(a => ({
    id: a.id, name: a.name, goal: a.goal, status: a.status,
    owner_wallet: a.owner_wallet,
    schedule_minutes: a.schedule_minutes, max_budget_per_run: a.max_budget_per_run,
    credit_balance: a.credit_balance || 0,
    credits_remaining: (a.credit_balance || 0) - (a.total_spent || 0),
    total_runs: a.total_runs, total_spent: a.total_spent,
    last_run: a.last_run, created_at: a.created_at,
    deployed_via: a.deployed_via || "unknown",
    pause_reason: a.pause_reason || null,
  }));
  res.json({ agents: mapped, count: mapped.length });
});

// Get single agent (ownership check)
app.get("/api/agents/:id", optionalWallet, (req, res) => {
  const agents = loadAgents();
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  // Ownership check for private data
  const callerWallet = req.wallet;
  if (agent.owner_wallet && callerWallet && callerWallet !== agent.owner_wallet) {
    // Return limited info for non-owners
    return res.json({
      agent: { id: agent.id, name: agent.name, status: agent.status, owner_wallet: agent.owner_wallet },
      owned: false,
    });
  }

  const safeAgent = { ...agent, credits_remaining: (agent.credit_balance || 0) - (agent.total_spent || 0) };
  if (safeAgent.reports?.length > 10) safeAgent.reports = safeAgent.reports.slice(-10);
  res.json({ agent: safeAgent, owned: true });
});

app.get("/api/agents/:id/reports", optionalWallet, (req, res) => {
  const agents = loadAgents();
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json({ reports: agent.reports || [], count: (agent.reports || []).length });
});

app.patch("/api/agents/:id/pause", requireAuth, (req, res) => {
  const agents = loadAgents();
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  // Ownership check
  if (agent.owner_wallet && req.wallet && req.wallet !== agent.owner_wallet) {
    return res.status(403).json({ error: "You don't own this agent." });
  }

  agent.status = "paused";
  agent.pause_reason = "manual";
  saveAgent(agent);
  if (agentTimers.has(agent.id)) { clearInterval(agentTimers.get(agent.id)); agentTimers.delete(agent.id); }
  res.json({ message: "Agent paused", agent_id: agent.id });
});

app.patch("/api/agents/:id/resume", requireAuth, (req, res) => {
  const agents = loadAgents();
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  if (agent.owner_wallet && req.wallet && req.wallet !== agent.owner_wallet) {
    return res.status(403).json({ error: "You don't own this agent." });
  }

  const remaining = (agent.credit_balance || 0) - (agent.total_spent || 0);
  if (remaining < (agent.max_budget_per_run || 0.50) * 0.5) {
    return res.status(400).json({
      error: `Insufficient credits ($${remaining.toFixed(2)} remaining). Top up first.`,
      credits_remaining: remaining,
    });
  }

  agent.status = "running";
  agent.pause_reason = null;
  saveAgent(agent);
  startAgentTimer(agent);
  res.json({ message: "Agent resumed", agent_id: agent.id, credits_remaining: remaining });
});

app.delete("/api/agents/:id", requireAuth, (req, res) => {
  const agent = loadAgents().find(a => a.id === req.params.id);
  if (agent?.owner_wallet && req.wallet && req.wallet !== agent.owner_wallet) {
    return res.status(403).json({ error: "You don't own this agent." });
  }
  if (agentTimers.has(req.params.id)) { clearInterval(agentTimers.get(req.params.id)); agentTimers.delete(req.params.id); }
  deleteAgentFile(req.params.id);
  res.json({ message: "Agent stopped and removed" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// x402 PAYWALLED ENDPOINTS (for AI agents paying with USDC)
// Payment = Authentication: x402 receipt proves wallet ownership
// ═══════════════════════════════════════════════════════════════════════════════

if (PAY_TO) {
  app.use(
    paymentMiddlewareFromConfig(
      {
        "POST /api/mission": { accepts: { scheme: "exact", price: "$0.10", network: NETWORK, payTo: PAY_TO } },
        "POST /api/agents/deploy": { accepts: { scheme: "exact", price: "$1.00", network: NETWORK, payTo: PAY_TO } },
        "POST /api/agents/topup": { accepts: { scheme: "exact", price: "$0.50", network: NETWORK, payTo: PAY_TO } },
      },
      new HTTPFacilitatorClient({ url: FACILITATOR_URL }),
      [{ network: NETWORK, server: new ExactStellarScheme() }],
    ),
  );
}

// Agent-to-Agent: Deploy via x402 payment
app.post("/api/agents/deploy", (req, res) => {
  const { name, goal, schedule_minutes, webhook_url, owner_wallet } = req.body;
  if (!name || !goal) return res.status(400).json({ error: "Required: name, goal" });

  // x402 payment proves the caller's identity
  // Owner wallet can be explicitly set or derived from payment
  const agentOwner = owner_wallet && isValidStellarAddress(owner_wallet) ? owner_wallet : null;

  let platformWallet;
  try { platformWallet = getPlatformClient().walletAddress; }
  catch { return res.status(500).json({ error: "Platform wallet not configured" }); }

  const budget = estimateBudgetPerRun();

  const agent = {
    id: crypto.randomUUID(),
    name, goal,
    owner_wallet: agentOwner,
    schedule_minutes: schedule_minutes || 60,
    max_budget_per_run: budget.suggested,
    credit_balance: 1.00,
    wallet_address: platformWallet,
    webhook_url: webhook_url || null,
    status: "running",
    deployed_via: "x402",
    created_at: new Date().toISOString(),
    last_run: null,
    total_runs: 0,
    total_spent: 0,
    reports: [],
  };

  saveAgent(agent);
  if (agentOwner) associateAgent(agentOwner, agent.id);
  startAgentTimer(agent);

  res.status(201).json({
    message: "Agent deployed via x402 ($1.00 USDC). Credits: $1.00",
    agent: {
      id: agent.id, name: agent.name, goal: agent.goal,
      owner_wallet: agent.owner_wallet,
      schedule_minutes: agent.schedule_minutes,
      max_budget_per_run: agent.max_budget_per_run,
      credit_balance: agent.credit_balance,
      status: agent.status,
      deployed_via: "x402",
    },
  });
});

// Agent-to-Agent: Top up via x402 payment
app.post("/api/agents/topup", (req, res) => {
  const { agent_id } = req.body;
  if (!agent_id) return res.status(400).json({ error: "Required: agent_id" });

  const agents = loadAgents();
  const agent = agents.find(a => a.id === agent_id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  agent.credit_balance = (agent.credit_balance || 0) + 0.50;
  saveAgent(agent);

  const remaining = agent.credit_balance - (agent.total_spent || 0);
  res.json({
    message: `$0.50 added via x402. Credits: $${agent.credit_balance.toFixed(2)}, remaining: $${remaining.toFixed(2)}`,
    credit_balance: agent.credit_balance,
    credits_remaining: remaining,
  });
});

// Mission (x402 or dashboard)
app.post("/api/mission", optionalWallet, async (req, res) => {
  const { request, max_budget } = req.body;
  if (!request) return res.status(400).json({ error: "Provide { request: '...' }" });

  const ownerWallet = req.wallet || req.body.wallet;

  try {
    const result = await executeAutonomousMission(request, { maxBudget: max_budget || 1.00 });
    const missionId = crypto.randomUUID();
    saveMission({
      id: missionId,
      request,
      owner_wallet: ownerWallet || null,
      max_budget: max_budget || 1.00,
      spent: result.budget?.spent || 0,
      tools_used: result.payments?.length || 0,
      attestation: result.attestation || null,
      timestamp: result.completed_at,
    });
    if (ownerWallet) associateMission(ownerWallet, missionId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WALLET, STATS, PAYMENT FEED, ATTESTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/api/wallet", optionalWallet, async (req, res) => {
  try {
    const targetWallet = req.wallet || req.query.wallet;
    if (!targetWallet) {
      return res.status(400).json({ error: "No wallet specified. Please provide your wallet via X-Wallet header or ?wallet= query parameter." });
    }
    res.json(await getWalletInfo(targetWallet));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── A2A Agent Card (Google A2A Protocol) ────────────────────────────────────
// Enables agent discovery by external systems.

app.get("/.well-known/agent.json", (_, res) => {
  const { tools } = loadRegistry();
  const approved = tools.filter(t => t.status === "approved");
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

  res.json({
    name: "Forge402",
    description: "Autonomous AI agent marketplace on Stellar. Deploy agents that run 24/7, pay for x402 tools with USDC, and produce intelligence reports. Agents can spawn sub-agents, manage credits, and operate fully autonomously.",
    url: baseUrl,
    version: "5.1.0",
    provider: {
      organization: "Forge402",
      url: baseUrl,
    },
    skills: [
      "agent-deployment",
      "autonomous-scheduling",
      "x402-payments",
      "agent-spawning",
      "market-data",
      "code-audit",
      "web-research",
      "intelligence-reports",
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      autonomousExecution: true,
      agentSpawning: true,
      scheduledRuns: true,
      x402Payments: true,
      mcp: true,
    },
    authentication: {
      schemes: ["x402", "sep-10"],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    endpoints: {
      tools: `${baseUrl}/api/tools`,
      agents: `${baseUrl}/api/agents`,
      mission: `${baseUrl}/api/mission`,
      deploy: `${baseUrl}/api/agents/deploy`,
      topup: `${baseUrl}/api/agents/topup`,
      stats: `${baseUrl}/api/stats`,
    },
    pricing: {
      currency: "USDC",
      network: "stellar:testnet",
      actions: {
        deploy_agent: { price: "1.00", description: "Deploy an autonomous sub-agent" },
        mission: { price: "0.10", description: "Run a one-off intelligence mission" },
        topup: { price: "0.50", description: "Add credits to an agent" },
      },
      tools: approved.map(t => ({
        id: t.id,
        name: t.name,
        price: t.price,
        endpoint: t.endpoint,
      })),
    },
  });
});

app.get("/api/stats", (_, res) => {
  const { tools } = loadRegistry();
  const agents = loadAgents();
  const paymentStats = getPaymentStats();
  res.json({
    tools: { total: tools.length, approved: tools.filter(t => t.status === "approved").length, pending: tools.filter(t => t.status === "pending").length },
    agents: { deployed: agents.length, running: agents.filter(a => a.status === "running").length },
    missions: { total_runs: agents.reduce((s, a) => s + (a.total_runs || 0), 0), total_usdc_spent: agents.reduce((s, a) => s + (a.total_spent || 0), 0) },
    payments: paymentStats,
    platform_wallet: PAY_TO,
  });
});

app.get("/api/payments", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const payments = getRecentPayments(limit);
  res.json({ payments, count: payments.length });
});

app.get("/api/payments/stats", (_, res) => res.json(getPaymentStats()));

app.get("/api/attestations", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json({ attestations: getRecentAttestations(limit) });
});

app.get("/api/attestations/:id/verify", (req, res) => {
  res.json(verifyAttestation(req.params.id));
});

app.get("/api/missions", optionalWallet, (req, res) => {
  const store = loadMissions();
  let missions = store.missions;
  // Filter by wallet if provided
  const filterWallet = req.wallet || req.query.wallet;
  if (filterWallet && isValidStellarAddress(filterWallet)) {
    missions = missions.filter(m => m.owner_wallet === filterWallet);
  }
  res.json({ missions: missions.slice(-50).reverse(), count: missions.length });
});

// ═══════════════════════════════════════════════════════════════════════════════
// START + AUTO-FIX REGISTRY URLS
// ═══════════════════════════════════════════════════════════════════════════════

function rewriteRegistryUrls() {
  if (BASE_URL === "http://localhost") return;
  const registry = loadRegistry();
  let updated = false;
  for (const tool of registry.tools) {
    if (tool.endpoint?.includes("http://localhost")) {
      tool.endpoint = tool.endpoint.replace("http://localhost", BASE_URL); updated = true;
    }
    if (tool.example_url?.includes("http://localhost")) {
      tool.example_url = tool.example_url.replace("http://localhost", BASE_URL); updated = true;
    }
  }
  if (updated) { saveRegistry(registry); console.log(`   🔄 Registry URLs rewritten to ${BASE_URL}`); }
}

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`\n⚡ Forge402 Backend — http://localhost:${PORT}`);
  console.log(`   🔐 Security: Wallet-based identity, challenge-response auth, x402 payments`);
  console.log(`   🌍 BASE_URL: ${BASE_URL}`);

  try {
    const { walletAddress } = getPlatformClient();
    console.log(`   💳 Platform wallet: ${walletAddress}`);
  } catch (e) {
    console.log(`   ⚠️  Wallet not configured: ${e.message}`);
  }

  rewriteRegistryUrls();

  const agents = loadAgents().filter(a => a.status === "running");
  if (agents.length > 0) {
    console.log(`   🤖 Resuming ${agents.length} agent(s)...`);
    agents.forEach(a => { startAgentTimer(a); console.log(`      ▸ ${a.name} (owner: ${a.owner_wallet?.slice(0, 8) || "legacy"}...)`); });
  }

  const { tools } = loadRegistry();
  console.log(`   📋 Registry: ${tools.filter(t => t.status === "approved").length} approved tools`);
  console.log(`   🔑 Admin key: ${ADMIN_KEY}`);
  console.log(`\n   AUTH FLOW:`);
  console.log(`   POST /api/auth/connect     — Quick connect (wallet public key)`);
  console.log(`   POST /api/auth/challenge   — Request auth challenge`);
  console.log(`   POST /api/auth/verify      — Verify signed challenge → session token`);
  console.log(`   POST /api/auth/verify-deposit — Verify on-chain USDC deposit\n`);
});
