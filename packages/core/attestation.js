/**
 * AgentHub — On-Chain Attestation Layer
 * 
 * Records mission attestations (mission hash, tools used, costs, tx hashes).
 * These attestations mirror the Soroban registry contract data shape and
 * can be submitted on-chain for verifiable agent activity proofs.
 * 
 * Off-chain: Stored in data/attestations.json
 * On-chain: Attestation hashes can be published to the Soroban registry contract
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const ATTESTATIONS_FILE = path.join(DATA_DIR, "attestations.json");
const PAYMENTS_FILE = path.join(DATA_DIR, "payments.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Attestation Storage ─────────────────────────────────────────────────────

function loadAttestations() {
  try { return JSON.parse(fs.readFileSync(ATTESTATIONS_FILE, "utf-8")); }
  catch { return { attestations: [] }; }
}

function saveAttestations(data) {
  fs.writeFileSync(ATTESTATIONS_FILE, JSON.stringify(data, null, 2));
}

function loadPayments() {
  try { return JSON.parse(fs.readFileSync(PAYMENTS_FILE, "utf-8")); }
  catch { return { payments: [] }; }
}

function savePayments(data) {
  // Keep last 500 payments
  if (data.payments.length > 500) {
    data.payments = data.payments.slice(-500);
  }
  fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
}

// ─── Generate Attestation Hash ───────────────────────────────────────────────

function generateAttestationHash(missionData) {
  const canonical = JSON.stringify({
    request: missionData.request,
    tools_used: missionData.tools_used,
    total_cost: missionData.total_cost,
    platform_fees: missionData.platform_fees,
    tx_hashes: missionData.tx_hashes,
    timestamp: missionData.timestamp,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// ─── Record Mission Attestation ──────────────────────────────────────────────

/**
 * Create an attestation for a completed mission.
 * This records:
 * - What tools were called
 * - How much was spent (and to whom)
 * - Transaction hashes (verifiable on Stellar Explorer)
 * - A SHA-256 attestation hash of the entire mission
 * 
 * The attestation hash is designed to be publishable to the 
 * Soroban RegistryContract.attest_tool() function.
 */
export function createMissionAttestation(missionResult, request) {
  const tools_used = (missionResult.payments || []).map(p => ({
    tool_id: p.service,
    cost: p.cost,
    tx_hash: p.tx_hash,
    verify_url: p.verify_url,
  }));

  const tx_hashes = (missionResult.payments || []).map(p => p.tx_hash).filter(h => h && h !== "unknown");

  const attestation = {
    id: crypto.randomUUID(),
    type: "mission_completion",
    request: request,
    tools_used,
    tools_count: tools_used.length,
    total_cost: missionResult.budget?.spent || 0,
    platform_fees: missionResult.budget?.platform_fees || 0,
    tx_hashes,
    wallet: missionResult.wallet?.address,
    network: missionResult.wallet?.network || "stellar:testnet",
    timestamp: missionResult.completed_at || new Date().toISOString(),
    attestation_hash: null, // computed below
    soroban_contract: {
      registry: "RegistryContract",
      function: "attest_tool",
      note: "This attestation hash can be submitted on-chain via Soroban for verifiable proof",
    },
  };

  attestation.attestation_hash = generateAttestationHash(attestation);

  // Persist
  const store = loadAttestations();
  store.attestations.push(attestation);
  // Keep last 200
  if (store.attestations.length > 200) {
    store.attestations = store.attestations.slice(-200);
  }
  saveAttestations(store);

  return attestation;
}

// ─── Record Payment Event ────────────────────────────────────────────────────

/**
 * Record an individual x402 payment event for the live payment feed.
 */
export function recordPayment(payment) {
  const event = {
    id: crypto.randomUUID(),
    service: payment.service,
    cost: payment.cost,
    platform_fee: payment.platform_fee || 0,
    tx_hash: payment.tx_hash,
    payer: payment.payer,
    recipient: payment.recipient,
    verify_url: `https://stellar.expert/explorer/testnet/tx/${payment.tx_hash}`,
    timestamp: new Date().toISOString(),
  };

  const store = loadPayments();
  store.payments.push(event);
  savePayments(store);
  return event;
}

// ─── Query Functions ─────────────────────────────────────────────────────────

export function getRecentPayments(limit = 50) {
  const store = loadPayments();
  return store.payments.slice(-limit).reverse();
}

export function getPaymentStats() {
  const store = loadPayments();
  const payments = store.payments;
  const totalSettled = payments.reduce((s, p) => s + (p.cost || 0), 0);
  const totalFees = payments.reduce((s, p) => s + (p.platform_fee || 0), 0);
  const uniqueTools = [...new Set(payments.map(p => p.service))];
  const last24h = payments.filter(p => new Date(p.timestamp) > new Date(Date.now() - 86400000));

  return {
    total_payments: payments.length,
    total_usdc_settled: Number(totalSettled.toFixed(4)),
    total_platform_fees: Number(totalFees.toFixed(4)),
    unique_tools_used: uniqueTools.length,
    payments_24h: last24h.length,
    usdc_settled_24h: Number(last24h.reduce((s, p) => s + (p.cost || 0), 0).toFixed(4)),
  };
}

export function getRecentAttestations(limit = 20) {
  const store = loadAttestations();
  return store.attestations.slice(-limit).reverse();
}

export function verifyAttestation(attestationId) {
  const store = loadAttestations();
  const att = store.attestations.find(a => a.id === attestationId);
  if (!att) return { valid: false, error: "Attestation not found" };

  const recomputed = generateAttestationHash(att);
  return {
    valid: recomputed === att.attestation_hash,
    attestation: att,
    recomputed_hash: recomputed,
    stored_hash: att.attestation_hash,
  };
}
