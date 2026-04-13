/**
 * AgentHub v5 — Start All Services
 * 
 * Launches:
 *   Port 4000 — Backend API (Registry + Agents + Gateway + Attestations)
 *   Port 4001 — Token Data Service (demo x402 tool)
 *   Port 4002 — GitHub Auditor Service (demo x402 tool)
 *   Port 4003 — Web Research Service (demo x402 tool)
 *   
 *   The Next.js dashboard runs separately: cd packages/dashboard && npm run dev
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Seed Registry ──────────────────────────────────────────────────────────
// Pre-populates the tool registry if it doesn't exist (fresh Cloud Run deploy)

const DATA_DIR = path.join(__dirname, "data");
const REGISTRY_FILE = path.join(DATA_DIR, "registry.json");
const AGENTS_DIR = path.join(DATA_DIR, "agents");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AGENTS_DIR)) fs.mkdirSync(AGENTS_DIR, { recursive: true });

if (!fs.existsSync(REGISTRY_FILE)) {
  const PROVIDER_PUB = process.env.STELLAR_PROVIDER_PUBLIC || "unknown";
  const defaultRegistry = {
    tools: [
      {
        id: "token-data",
        name: "Token Data Service",
        description: "Deep crypto token metrics from CoinGecko. Returns price, market cap, 24h volume, GitHub URL, contract address, FDV, circulating supply, description, and categories.",
        endpoint: "http://localhost:4001/api/token-data",
        method: "GET",
        price: "$0.01",
        category: "market-data",
        params: "?query=TOKEN_NAME (e.g. ?query=VVV or ?query=bitcoin) OR ?top=N for top N tokens",
        example_url: "http://localhost:4001/api/token-data?query=VVV",
        provider_wallet: PROVIDER_PUB,
        contact: "agenthub-team",
        status: "approved",
        registered_at: "2026-04-11T00:00:00.000Z",
        approved_at: "2026-04-11T00:00:00.000Z",
      },
      {
        id: "github-auditor",
        name: "GitHub Auditor Service",
        description: "Deep GitHub repository audit. Analyzes commit velocity, top contributors, language breakdown, license check, security policies, and calculates a trust score.",
        endpoint: "http://localhost:4002/api/audit",
        method: "GET",
        price: "$0.05",
        category: "code-audit",
        params: "?repo=OWNER/REPO (e.g. ?repo=stellar/soroban-sdk)",
        example_url: "http://localhost:4002/api/audit?repo=stellar/soroban-sdk",
        provider_wallet: PROVIDER_PUB,
        contact: "agenthub-team",
        status: "approved",
        registered_at: "2026-04-11T00:00:00.000Z",
        approved_at: "2026-04-11T00:00:00.000Z",
      },
      {
        id: "web-research",
        name: "Web Research Service",
        description: "Fetches and extracts readable text content from any URL. Strips HTML to clean text. Use this to analyze project websites, whitepapers, and documentation.",
        endpoint: "http://localhost:4003/api/research",
        method: "POST",
        price: "$0.02",
        category: "web-scraping",
        params: "POST body: { \"url\": \"https://example.com\" }",
        example_url: "http://localhost:4003/api/research",
        provider_wallet: PROVIDER_PUB,
        contact: "agenthub-team",
        status: "approved",
        registered_at: "2026-04-11T00:00:00.000Z",
        approved_at: "2026-04-11T00:00:00.000Z",
      },
    ],
  };
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(defaultRegistry, null, 2));
  console.log("📦 Seeded default tool registry (3 tools).");
}

const services = [
  { name: "🧠 Backend API", path: path.join(__dirname, "packages/gateway/server.js") },
  { name: "🪙 Token Data", path: path.join(__dirname, "packages/tools/token-data/server.js") },
  { name: "🔍 GitHub Auditor", path: path.join(__dirname, "packages/tools/github-auditor/server.js") },
  { name: "🌐 Web Research", path: path.join(__dirname, "packages/tools/web-research/server.js") },
];

const children = [];

console.log("═══════════════════════════════════════════════════════");
console.log("  ⚡ AgentHub v5 — Autonomous x402 Agent Marketplace  ");
console.log("═══════════════════════════════════════════════════════\n");

for (const svc of services) {
  const child = spawn("node", [svc.path], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  children.push(child);

  child.stdout.on("data", data => {
    data.toString().trim().split("\n").forEach(line => console.log(`[${svc.name}] ${line}`));
  });
  child.stderr.on("data", data => {
    data.toString().trim().split("\n").forEach(line => {
      if (!line.includes("injected env") && !line.includes("MODULE_TYPELESS")) {
        console.error(`[${svc.name}] ${line}`);
      }
    });
  });
  child.on("exit", code => {
    if (code !== 0) console.error(`[${svc.name}] exited with code ${code}`);
  });
}

console.log("\n✅ All services starting...\n");
console.log("  BACKEND:  http://localhost:4000  (Registry + Agents + Gateway + Attestations)");
console.log("  TOOLS:    http://localhost:4001-4003  (Demo x402 services)");
console.log("  FRONTEND: Run separately: cd packages/dashboard && npm run dev");
console.log("\n  Endpoints:");
console.log("    GET  /health           — Health check");
console.log("    GET  /api/tools        — List approved tools");
console.log("    GET  /api/agents       — List agents");
console.log("    GET  /api/payments     — Live payment feed");
console.log("    GET  /api/attestations — Mission attestations");
console.log("    POST /api/mission      — Run mission ($0.10 x402)");
console.log("    POST /api/agents/deploy — Deploy agent ($1.00 x402)");
console.log("\n  Press Ctrl+C to stop all services.\n");

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[AgentHub] ${signal} received. Shutting down gracefully...`);
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch {}
  }
  setTimeout(() => {
    console.log("[AgentHub] Force killing remaining processes...");
    for (const child of children) {
      try { child.kill("SIGKILL"); } catch {}
    }
    process.exit(0);
  }, 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
