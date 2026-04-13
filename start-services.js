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
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
