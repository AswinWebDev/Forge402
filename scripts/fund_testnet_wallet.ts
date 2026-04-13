import { Keypair } from "@stellar/stellar-sdk";

async function generateAndFundWallet() {
  const pair = Keypair.random();
  console.log("Generating new Stellar Wallet...");
  console.log("Public Key:", pair.publicKey());
  console.log("Secret Key:", pair.secret());

  console.log("\nRequesting testnet XLM from Friendbot...");
  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(pair.publicKey())}`
    );
    const responseJSON = await response.json();
    console.log("SUCCESS! You have a new testnet account funded with 10,000 XLM.");
    console.log("Use this secret key in the AgentHub MCP config to pay for x402 tools & Soroban Escrows.");
  } catch (e) {
    console.error("ERROR! Failed to fund account:", e);
  }
}

generateAndFundWallet();
