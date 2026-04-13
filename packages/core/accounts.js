/**
 * AgentHub — Account Ledger System
 * 
 * Wallet-based identity: every user/agent is identified by their Stellar public key.
 * 
 * SECURITY MODEL:
 * - Identity = Stellar public key (starts with G, 56 chars)
 * - Dashboard auth: challenge-response (server signs nonce, client signs with their key)
 * - Agent auth: x402 payment receipt proves wallet ownership
 * - Deposits verified on-chain via Stellar Horizon API
 * - No private keys stored or transmitted via API
 * - Session tokens are HMAC-signed, time-limited
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Keypair } from "@stellar/stellar-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const DATA_DIR = path.join(__dirname, "../../data");
const ACCOUNTS_DIR = path.join(DATA_DIR, "accounts");

if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });

// Server-side secret for HMAC session tokens
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Platform wallet (receives deposits — this is the PROVIDER wallet, not the client wallet)
const PLATFORM_WALLET = process.env.STELLAR_PROVIDER_PUBLIC;
const HORIZON_URL = "https://horizon-testnet.stellar.org";

// ─── Stellar Address Validation ──────────────────────────────────────────────

export function isValidStellarAddress(address) {
  if (!address || typeof address !== "string") return false;
  if (!address.startsWith("G") || address.length !== 56) return false;
  try {
    Keypair.fromPublicKey(address);
    return true;
  } catch {
    return false;
  }
}
// ─── Challenge-Response Authentication (SEP-10 Transaction-based) ────────────
// Uses Stellar transactions as challenges — the standard approach for all Stellar dApps.
// This works correctly with Freighter's signTransaction() method.
//
// Flow:
// 1. Server creates a ManageData transaction as challenge (never submitted to network)
// 2. Client signs with wallet (Freighter popup or Keypair.sign)
// 3. Server verifies the transaction signature matches the client's public key
// 4. Session token issued

import { TransactionBuilder, Networks, Operation, Account } from "@stellar/stellar-sdk";

const pendingChallenges = new Map(); // wallet → { xdr, nonce, expires }

// Server keypair for signing the challenge transaction (uses platform key)
function getServerKeypair() {
  const secret = process.env.STELLAR_PROVIDER_SECRET;
  if (!secret) throw new Error("STELLAR_PROVIDER_SECRET not configured");
  return Keypair.fromSecret(secret);
}

export function generateChallenge(wallet) {
  if (!isValidStellarAddress(wallet)) throw new Error("Invalid Stellar address");

  const serverKeypair = getServerKeypair();
  const nonce = crypto.randomBytes(32).toString("hex");
  const timestamp = Date.now();

  // Build a simple challenge transaction (never submitted to the network)
  // Using the client's public key as the source so they must sign it
  const clientAccount = new Account(wallet, "0");  // sequence doesn't matter — never submitted
  
  const transaction = new TransactionBuilder(clientAccount, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.manageData({
      name: "agenthub:auth",
      value: nonce,
      source: wallet,
    }))
    .setTimeout(300)
    .build();

  // Server signs the transaction first (proves challenge came from our server)
  transaction.sign(serverKeypair);
  // Use toEnvelope().toXDR('base64') for consistent base64 encoding
  const challengeXDR = transaction.toEnvelope().toXDR('base64');

  // Store for verification
  pendingChallenges.set(wallet, { challengeXDR, nonce, expires: timestamp + 5 * 60 * 1000 });

  // Clean old challenges
  for (const [w, c] of pendingChallenges.entries()) {
    if (c.expires < Date.now()) pendingChallenges.delete(w);
  }

  return { 
    challengeXDR,
    networkPassphrase: Networks.TESTNET,
    nonce, 
    expires_in: 300,
  };
}

export function verifyChallenge(wallet, signedXDR) {
  if (!isValidStellarAddress(wallet)) throw new Error("Invalid Stellar address");

  const pending = pendingChallenges.get(wallet);
  if (!pending) throw new Error("No pending challenge. Request a new one.");
  if (pending.expires < Date.now()) {
    pendingChallenges.delete(wallet);
    throw new Error("Challenge expired. Request a new one.");
  }

  try {
    // Parse the signed transaction
    const transaction = TransactionBuilder.fromXDR(signedXDR, Networks.TESTNET);
    
    // Verify: the transaction must have a signature from the client's public key
    const clientKeypair = Keypair.fromPublicKey(wallet);
    const txHash = transaction.hash();
    
    let clientSigned = false;
    for (const sig of transaction.signatures) {
      if (clientKeypair.verify(txHash, sig.signature())) {
        clientSigned = true;
        break;
      }
    }

    if (!clientSigned) {
      throw new Error("Invalid signature — transaction not signed by this wallet.");
    }

    // Verify the ManageData operation contains our nonce
    const ops = transaction.operations;
    const authOp = ops.find(op => op.type === "manageData" && op.name === "agenthub:auth");
    if (!authOp) throw new Error("Invalid challenge transaction — missing auth operation.");
    
    const opValue = authOp.value?.toString("utf-8") || authOp.value?.toString() || "";
    if (opValue !== pending.nonce) {
      throw new Error("Nonce mismatch — possible replay attack.");
    }
  } catch (e) {
    if (e.message.includes("Invalid signature") || e.message.includes("Nonce mismatch") || e.message.includes("replay")) throw e;
    throw new Error("Signature verification failed: " + e.message);
  }

  // Challenge consumed
  pendingChallenges.delete(wallet);

  // Issue session token
  return createSessionToken(wallet);
}

// ─── Session Tokens (HMAC-signed, server-side verification) ──────────────────

export function createSessionToken(wallet) {
  const payload = {
    wallet,
    issued_at: Date.now(),
    expires_at: Date.now() + SESSION_EXPIRY_MS,
  };
  const data = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
  const token = Buffer.from(JSON.stringify({ data, hmac })).toString("base64");

  return { token, wallet, expires_at: payload.expires_at };
}

export function verifySessionToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    const expectedHmac = crypto.createHmac("sha256", SESSION_SECRET).update(decoded.data).digest("hex");
    
    if (decoded.hmac !== expectedHmac) return null; // tampered
    
    const payload = JSON.parse(decoded.data);
    if (payload.expires_at < Date.now()) return null; // expired
    
    return payload; // { wallet, issued_at, expires_at }
  } catch {
    return null;
  }
}

// ─── Account Ledger ──────────────────────────────────────────────────────────

function accountPath(wallet) {
  // Sanitize wallet address for filesystem safety
  const safe = wallet.replace(/[^A-Z0-9]/g, "");
  return path.join(ACCOUNTS_DIR, `${safe}.json`);
}

export function getAccount(wallet) {
  if (!isValidStellarAddress(wallet)) return null;
  try {
    return JSON.parse(fs.readFileSync(accountPath(wallet), "utf-8"));
  } catch {
    return null;
  }
}

export function getOrCreateAccount(wallet) {
  if (!isValidStellarAddress(wallet)) throw new Error("Invalid Stellar address");

  let account = getAccount(wallet);
  if (account) return account;

  account = {
    wallet,
    balance: 0,
    total_deposited: 0,
    total_spent: 0,
    deposits: [],     // { tx_hash, amount, verified_at }
    agents: [],       // agent IDs owned by this wallet
    missions: [],     // mission IDs run by this wallet
    created_at: new Date().toISOString(),
  };

  fs.writeFileSync(accountPath(wallet), JSON.stringify(account, null, 2));
  return account;
}

export function saveAccount(account) {
  fs.writeFileSync(accountPath(account.wallet), JSON.stringify(account, null, 2));
}

// ─── Credit Operations ───────────────────────────────────────────────────────

export function addCredits(wallet, amount, txHash, source = "deposit") {
  const account = getOrCreateAccount(wallet);
  account.balance += amount;
  account.total_deposited += amount;
  account.deposits.push({
    tx_hash: txHash || "internal",
    amount,
    source, // "deposit", "x402_deploy", "x402_topup"
    verified_at: new Date().toISOString(),
  });
  // Keep last 100 deposits
  if (account.deposits.length > 100) account.deposits = account.deposits.slice(-100);
  saveAccount(account);
  return account;
}

export function deductCredits(wallet, amount, reason = "tool_call") {
  const account = getOrCreateAccount(wallet);
  if (account.balance < amount) {
    throw new Error(`Insufficient credits: $${account.balance.toFixed(4)} available, $${amount.toFixed(4)} needed`);
  }
  account.balance -= amount;
  account.total_spent += amount;
  saveAccount(account);
  return account;
}

export function getBalance(wallet) {
  const account = getAccount(wallet);
  return account ? account.balance : 0;
}

// ─── Agent/Mission Association ───────────────────────────────────────────────

export function associateAgent(wallet, agentId) {
  const account = getOrCreateAccount(wallet);
  if (!account.agents.includes(agentId)) {
    account.agents.push(agentId);
    saveAccount(account);
  }
}

export function associateMission(wallet, missionId) {
  const account = getOrCreateAccount(wallet);
  account.missions.push(missionId);
  // Keep last 200
  if (account.missions.length > 200) account.missions = account.missions.slice(-200);
  saveAccount(account);
}

// ─── On-Chain Deposit Verification (Stellar Horizon API) ─────────────────────

/**
 * Check Stellar Horizon for USDC payments FROM this wallet TO the platform wallet.
 * Credits any unprocessed deposits (by tx_hash dedup).
 */
export async function verifyAndCreditDeposits(wallet) {
  if (!isValidStellarAddress(wallet)) throw new Error("Invalid Stellar address");
  if (!PLATFORM_WALLET) throw new Error("Platform wallet not configured");

  const account = getOrCreateAccount(wallet);
  const processedTxHashes = new Set(account.deposits.map(d => d.tx_hash));

  // Query Horizon for payments TO the platform wallet FROM this user
  const url = `${HORIZON_URL}/accounts/${PLATFORM_WALLET}/payments?order=desc&limit=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Horizon API error: ${res.status}`);

  const data = await res.json();
  const records = data._embedded?.records || [];

  let newDeposits = 0;
  let totalNewAmount = 0;

  for (const tx of records) {
    // Only process USDC payments from this wallet
    if (tx.type !== "payment") continue;
    if (tx.from !== wallet) continue;
    if (tx.asset_code !== "USDC") continue;
    if (processedTxHashes.has(tx.transaction_hash)) continue; // already processed

    const amount = parseFloat(tx.amount);
    if (amount <= 0) continue;

    // Credit the account
    addCredits(wallet, amount, tx.transaction_hash, "stellar_deposit");
    newDeposits++;
    totalNewAmount += amount;
  }

  // Reload account after credits
  const updated = getAccount(wallet);

  return {
    wallet,
    new_deposits: newDeposits,
    new_amount: totalNewAmount,
    balance: updated.balance,
    total_deposited: updated.total_deposited,
    platform_wallet: PLATFORM_WALLET,
    verify_url: `https://stellar.expert/explorer/testnet/account/${wallet}`,
  };
}

// ─── On-Chain Wallet Info (Stellar Horizon API) ──────────────────────────────

export async function getWalletBalances(wallet) {
  if (!isValidStellarAddress(wallet)) throw new Error("Invalid Stellar address");

  const res = await fetch(`${HORIZON_URL}/accounts/${wallet}`);
  if (!res.ok) {
    if (res.status === 404) return { wallet, funded: false, xlm: "0", usdc: "0" };
    throw new Error(`Horizon API error: ${res.status}`);
  }

  const data = await res.json();
  const xlm = data.balances?.find(b => b.asset_type === "native")?.balance || "0";
  const usdc = data.balances?.find(b => b.asset_code === "USDC")?.balance || "0";

  return {
    wallet,
    funded: true,
    xlm,
    usdc,
    network: "stellar:testnet",
    explorer_url: `https://stellar.expert/explorer/testnet/account/${wallet}`,
  };
}

// ─── Get Recent Transactions (Stellar Horizon API) ───────────────────────────

export async function getWalletTransactions(wallet, limit = 15) {
  if (!isValidStellarAddress(wallet)) throw new Error("Invalid Stellar address");

  const res = await fetch(`${HORIZON_URL}/accounts/${wallet}/payments?order=desc&limit=${limit}`);
  if (!res.ok) return [];

  const data = await res.json();
  return (data._embedded?.records || []).filter(r => r.type === "payment").map(tx => ({
    type: tx.to === wallet ? "received" : "sent",
    amount: tx.amount,
    asset: tx.asset_code || "XLM",
    from: tx.from,
    to: tx.to,
    tx_hash: tx.transaction_hash,
    created_at: tx.created_at,
    explorer_url: `https://stellar.expert/explorer/testnet/tx/${tx.transaction_hash}`,
  }));
}
