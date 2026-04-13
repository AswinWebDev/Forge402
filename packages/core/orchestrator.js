/**
 * AgentHub v4.2 — Core Orchestrator (Shared Brain)
 * 
 * SECURITY MODEL:
 * - The PLATFORM wallet is configured server-side in .env
 * - Users NEVER provide secret keys through the UI
 * - Agents use the platform wallet for all x402 payments
 * - Secret keys never leave the server process
 * 
 * REVENUE MODEL:
 * - External agents pay $0.10 x402 fee to use /api/mission (gateway paywall)
 * - For every tool payment, 5% orchestration fee goes to platform (min $0.005)
 * - Tool providers receive 100% of the x402 tool price directly
 * - Platform fee is deducted from user's mission budget (not from tool provider)
 */
import { OpenAI } from "openai";
import { Horizon } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createMissionAttestation, recordPayment } from "./attestation.js";

const NETWORK = "stellar:testnet";
const RPC_URL = "https://soroban-testnet.stellar.org";
const horizonServer = new Horizon.Server("https://horizon-testnet.stellar.org");
const PLATFORM_FEE_RATE = 0.05; // 5% orchestration fee
const MIN_PLATFORM_FEE = 0.005; // $0.005 minimum

// ─── x402 Client Factory (any wallet → payment client) ──────────────────────

const _clientCache = new Map();

/**
 * Create an x402 payment client from a Stellar secret key.
 * This is how agents connect with their own wallets.
 * 
 * Usage:
 *   const client = createAgentClient("SXXX...");
 *   const res = await client.paidFetch("https://tool.endpoint/api", opts);
 * 
 * For testnet: uses testnet USDC
 * For mainnet: just change NETWORK + RPC_URL — same code, real USDC
 */
export function createAgentClient(stellarSecret) {
  if (!stellarSecret) throw new Error("Stellar secret key required");

  // Cache by secret to avoid recreating for same wallet
  if (_clientCache.has(stellarSecret)) return _clientCache.get(stellarSecret);

  const signer = createEd25519Signer(stellarSecret, NETWORK);
  const paymentClient = new x402Client().register(
    "stellar:*",
    new ExactStellarScheme(signer, { url: RPC_URL }),
  );
  const httpClient = new x402HTTPClient(paymentClient);
  const paidFetch = wrapFetchWithPayment(fetch, httpClient);

  const client = { paidFetch, httpClient, walletAddress: signer.address };
  _clientCache.set(stellarSecret, client);
  return client;
}

/**
 * Get the platform's x402 client (uses STELLAR_CLIENT_SECRET from .env).
 * Used by internal services (agent timers, etc.).
 */
export function getPlatformClient() {
  const secret = process.env.STELLAR_CLIENT_SECRET;
  if (!secret) throw new Error("STELLAR_CLIENT_SECRET not configured in .env");
  return createAgentClient(secret);
}

// ─── Get wallet balance ──────────────────────────────────────────────────────

export async function getWalletInfo(address) {
  const walletAddress = address || getPlatformClient().walletAddress;
  try {
    const account = await horizonServer.loadAccount(walletAddress);
    const xlm = account.balances.find(b => b.asset_type === "native");
    const usdc = account.balances.find(b => b.asset_code === "USDC");
    return {
      address: walletAddress,
      xlm_balance: xlm?.balance || "0",
      usdc_balance: usdc?.balance || "0",
      network: NETWORK,
    };
  } catch {
    return { address: walletAddress, xlm_balance: "ERROR", usdc_balance: "ERROR", network: NETWORK };
  }
}

// ─── Fetch tool registry from backend ────────────────────────────────────────

export async function fetchRegistry() {
  const url = process.env.REGISTRY_URL || "http://localhost:4000";
  try {
    const res = await fetch(`${url}/api/tools`);
    const data = await res.json();
    return data.tools || [];
  } catch {
    return [];
  }
}

// ─── Execute a single x402 paid fetch ────────────────────────────────────────

async function executePaidFetch(url, method = "GET", body = null, stellarSecret = null) {
  // Use agent's wallet if provided, otherwise platform wallet
  const client = stellarSecret ? createAgentClient(stellarSecret) : getPlatformClient();
  const { paidFetch, httpClient } = client;
  const init = { method };
  if (body && method === "POST") {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  console.log(`[x402] Calling ${method} ${url}`);
  try {
    const response = await paidFetch(url, init);
    console.log(`[x402] Response: ${response.status} from ${url}`);
    const text = await response.text();
    let receipt = null;
    if (httpClient) {
      try { receipt = httpClient.getPaymentSettleResponse(h => response.headers.get(h)); } catch {}
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, payment_made: receipt !== null, receipt, data: parsed };
  } catch (e) {
    console.error(`[x402] FAILED ${method} ${url}:`, e.message, e.cause || "");
    throw e;
  }
}

// ─── Parse price string to number ────────────────────────────────────────────

function parsePrice(priceStr) {
  if (!priceStr) return 0;
  const match = String(priceStr).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

// ─── THE AUTONOMOUS MISSION EXECUTOR ─────────────────────────────────────────

/**
 * @param {string} userRequest - Natural language request
 * @param {object} options
 * @param {number} options.maxBudget - Max USDC to spend (default 1.00)
 */
export async function executeAutonomousMission(userRequest, options = {}) {
  const { maxBudget = 1.00, stellarSecret = null } = options;

  const veniceApiKey = process.env.VENICE_API_KEY;
  const venice = new OpenAI({
    apiKey: veniceApiKey || "dummy",
    baseURL: "https://api.venice.ai/api/v1",
  });

  // Use agent's own wallet if stellarSecret provided, otherwise platform
  const client = stellarSecret ? createAgentClient(stellarSecret) : getPlatformClient();
  const { walletAddress } = client;
  const missionLog = [];
  const payments = [];
  const serviceResults = {};
  let totalSpent = 0;
  let platformFees = 0;

  const log = (msg) => missionLog.push(`[${new Date().toISOString()}] ${msg}`);
  log(`🎯 Mission: "${userRequest}"`);
  log(`💰 Budget: $${maxBudget.toFixed(2)} USDC | Wallet: ${walletAddress.slice(0, 8)}...`);

  // ─── Fetch live registry ──────────────────────────────────────────────────
  const registry = await fetchRegistry();
  log(`📋 Registry: ${registry.length} tools available`);

  if (registry.length === 0) {
    return {
      report: "No tools available in the registry. Register and approve tools first.",
      payments: [], wallet: await getWalletInfo(), mission_log: missionLog,
      budget: { limit: maxBudget, spent: 0, remaining: maxBudget },
      completed_at: new Date().toISOString(),
    };
  }

  // ─── Phase 1: Venice AI plans ─────────────────────────────────────────────
  log("🧠 Phase 1: Planning...");

  // Build tool descriptions — DO NOT include endpoint URLs to prevent Venice from
  // hallucinating production domains. We always resolve URLs from the registry.
  const toolDescriptions = registry.map(t =>
    `- ID: ${t.id} | ${t.name} | ${t.price} | Method: ${t.method}\n  Description: ${t.description}\n  Params: ${t.params || "none"}`
  ).join("\n");

  let plan;
  try {
    const planResponse = await venice.chat.completions.create({
      model: "llama-3.3-70b",
      messages: [
        { role: "system", content: "Output ONLY valid JSON. No markdown fences, no explanation." },
        { role: "user", content: `You are an AI orchestrator planning x402 service calls.

USER REQUEST: "${userRequest}"

AVAILABLE TOOLS:
${toolDescriptions}

IMPORTANT: For the "url" field, use this format EXACTLY:
- token-data: http://localhost:4001/api/token-data?query=TERM
- github-auditor: http://localhost:4002/api/audit?repo=OWNER/REPO
- web-research: http://localhost:4003/api/research (POST with body {"url":"https://..."})

NEVER use any other domain. ALWAYS use http://localhost with the port shown above.

Return this exact JSON structure:
{"strategy":"one sentence","steps":[{"tool_id":"...","url":"http://localhost:PORT/path?params","method":"GET or POST","body":null,"purpose":"why"}]}

Extract any token names, repo names, or URLs from the user's request and include them in the URLs. Plan only 1-2 initial steps — the system auto-discovers follow-ups.` },
      ],
    });
    const raw = planResponse.choices[0].message.content
      .replace(/```json\n?/g, "").replace(/```\n?/g, "")
      .replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    plan = JSON.parse(raw);
    log(`📋 Strategy: ${plan.strategy}`);
  } catch (e) {
    // Smart fallback: extract token name from request
    const tokenMatch = userRequest.match(/\b([A-Z]{2,10})\b/) || userRequest.match(/['"]([^'"]+)['"]/);
    const query = tokenMatch ? tokenMatch[1] : "bitcoin";
    plan = {
      strategy: `Fallback: lookup ${query}`,
      steps: [{ tool_id: "token-data", url: `http://localhost:4001/api/token-data?query=${query}`, method: "GET", body: null, purpose: `Get ${query} data` }]
    };
    log(`⚠️ Planning fallback for "${query}": ${e.message}`);
  }

  // ─── Phase 2: Execute with budget tracking ────────────────────────────────
  log("💳 Phase 2: Executing...");
  const balanceBefore = await getWalletInfo();

  for (const step of plan.steps) {
    const tool = registry.find(t => t.id === step.tool_id);
    const stepCost = tool ? parsePrice(tool.price) : 0.01;

    if (totalSpent + stepCost > maxBudget) {
      log(`⛔ BUDGET: Skipping ${step.tool_id} — would exceed $${maxBudget} (spent: $${totalSpent.toFixed(2)})`);
      continue;
    }

    // CRITICAL: Always use the registry's endpoint, NOT Venice's URL.
    // Venice may hallucinate the production domain (e.g. cloud-run-url:4001)
    // but tool services only listen on localhost inside the container.
    let callUrl = step.url;
    if (tool) {
      const registryEndpoint = tool.endpoint; // e.g. http://localhost:4001/api/token-data
      // Extract query string from Venice's planned URL and append to registry endpoint
      try {
        const veniceUrl = new URL(step.url);
        const queryString = veniceUrl.search; // e.g. ?query=bitcoin
        callUrl = registryEndpoint + queryString;
      } catch {
        // If Venice URL is malformed, try to extract query params manually
        const qIndex = step.url.indexOf("?");
        callUrl = qIndex >= 0 ? registryEndpoint + step.url.slice(qIndex) : registryEndpoint;
      }
      log(`  🔗 Resolved URL: ${callUrl} (from registry)`);
    }

    log(`  ⏳ ${step.tool_id}: ${step.purpose} (~$${stepCost})`);
    try {
      const r = await executePaidFetch(callUrl, step.method, step.body, stellarSecret);
      serviceResults[step.tool_id] = r.data;
      if (r.payment_made) {
        const fee = Math.max(stepCost * PLATFORM_FEE_RATE, MIN_PLATFORM_FEE);
        totalSpent += stepCost + fee;
        platformFees += fee;
        const paymentRecord = { service: step.tool_id, cost: stepCost, platform_fee: fee, tx_hash: r.receipt?.transaction || "unknown", payer: walletAddress, recipient: "tool-provider" };
        payments.push(paymentRecord);
        try { recordPayment(paymentRecord); } catch {}
      }
      log(`  ✅ ${step.tool_id} (HTTP ${r.status}, paid: ${r.payment_made}, total: $${totalSpent.toFixed(2)})`);
    } catch (e) {
      console.error(`[MISSION] Tool ${step.tool_id} FAILED:`, e.message, e.stack?.split("\n").slice(0, 3).join(" | "));
      log(`  ❌ ${step.tool_id}: ${e.message}`);
      serviceResults[step.tool_id] = { error: e.message };
    }
  }

  // ─── Phase 2.5: Adaptive follow-ups ────────────────────────────────────────
  const tokenData = serviceResults["token-data"];
  if (tokenData && !tokenData.error) {
    const first = (tokenData.results || [tokenData])[0];

    if (first?.github_url && first.github_url !== "unknown" && !serviceResults["github-auditor"]) {
      const m = first.github_url.match(/github\.com\/([^\/]+\/[^\/]+)/);
      const auditor = registry.find(t => t.id === "github-auditor");
      const cost = auditor ? parsePrice(auditor.price) : 0.05;
      if (m && totalSpent + cost <= maxBudget) {
        const repo = m[1].replace(/\.git$/, "");
        log(`  🔄 ADAPTIVE: GitHub (${repo}) → auditing`);
        try {
          const r = await executePaidFetch(`${auditor?.endpoint || "http://localhost:4002/api/audit"}?repo=${repo}`, "GET", null, stellarSecret);
          serviceResults["github-auditor"] = r.data;
          if (r.payment_made) { const fee = Math.max(cost * PLATFORM_FEE_RATE, MIN_PLATFORM_FEE); totalSpent += cost + fee; platformFees += fee; const pr = { service: "github-auditor (auto)", cost, platform_fee: fee, tx_hash: r.receipt?.transaction || "unknown", payer: walletAddress, recipient: "tool-provider" }; payments.push(pr); try { recordPayment(pr); } catch {} }
          log(`  ✅ Adaptive audit done`);
        } catch (e) { log(`  ❌ Adaptive audit: ${e.message}`); }
      }
    }

    if (first?.homepage && first.homepage !== "unknown" && first.homepage !== "" && !serviceResults["web-research"]) {
      const web = registry.find(t => t.id === "web-research");
      const cost = web ? parsePrice(web.price) : 0.02;
      if (totalSpent + cost <= maxBudget) {
        log(`  🔄 ADAPTIVE: Homepage (${first.homepage}) → researching`);
        try {
          const r = await executePaidFetch(web?.endpoint || "http://localhost:4003/api/research", "POST", { url: first.homepage }, stellarSecret);
          serviceResults["web-research"] = r.data;
          if (r.payment_made) { const fee = Math.max(cost * PLATFORM_FEE_RATE, MIN_PLATFORM_FEE); totalSpent += cost + fee; platformFees += fee; const pr = { service: "web-research (auto)", cost, platform_fee: fee, tx_hash: r.receipt?.transaction || "unknown", payer: walletAddress, recipient: "tool-provider" }; payments.push(pr); try { recordPayment(pr); } catch {} }
          log(`  ✅ Adaptive research done`);
        } catch (e) { log(`  ❌ Adaptive research: ${e.message}`); }
      }
    }
  }

  // ─── Phase 3: Synthesize ──────────────────────────────────────────────────
  log("📊 Phase 3: Synthesizing...");
  const balanceAfter = await getWalletInfo();

  let report;
  try {
    const synth = await venice.chat.completions.create({
      model: "llama-3.3-70b",
      messages: [
        { role: "system", content: "You are a professional analyst. Write clear, structured reports." },
        { role: "user", content: `Synthesize a report for: "${userRequest}"\n\nData from ${payments.length} paid services:\n${JSON.stringify(serviceResults, null, 2)}\n\nSpent: $${totalSpent.toFixed(2)} of $${maxBudget} budget.` },
      ],
    });
    report = synth.choices[0].message.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  } catch (e) {
    report = `Synthesis error: ${e.message}\n\nRaw data:\n${JSON.stringify(serviceResults, null, 2)}`;
  }

  log(`✅ Complete. Spent: $${totalSpent.toFixed(2)}/${maxBudget.toFixed(2)}`);

  const missionResult = {
    report,
    payments: payments.map(p => ({ ...p, verify_url: `https://stellar.expert/explorer/testnet/tx/${p.tx_hash}` })),
    wallet: { address: walletAddress, usdc_before: balanceBefore.usdc_balance, usdc_after: balanceAfter.usdc_balance, network: NETWORK },
    budget: { limit: maxBudget, spent: totalSpent, remaining: maxBudget - totalSpent, platform_fees: platformFees, tool_costs: totalSpent - platformFees },
    mission_log: missionLog,
    completed_at: new Date().toISOString(),
  };

  // ─── Create on-chain attestation ───────────────────────────────────────────
  try {
    const attestation = createMissionAttestation(missionResult, userRequest);
    missionResult.attestation = {
      id: attestation.id,
      hash: attestation.attestation_hash,
      tools_attested: attestation.tools_count,
      verify_url: `/api/attestations/${attestation.id}/verify`,
    };
    log(`🔗 Attestation: ${attestation.attestation_hash.slice(0, 16)}...`);
  } catch (e) {
    log(`⚠️ Attestation failed: ${e.message}`);
  }

  return missionResult;
}
