/**
 * Derive Stellar secret key from Freighter recovery phrase.
 * 
 * Usage: node scripts/mnemonic-to-secret.js "word1 word2 word3 ... word12"
 * 
 * This outputs the secret key (starts with S) and public key (starts with G).
 * You can then use the secret key in AGENT_STELLAR_SECRET.
 */
import StellarHDWallet from "stellar-hd-wallet";

const mnemonic = process.argv.slice(2).join(" ").trim();

if (!mnemonic || mnemonic.split(" ").length < 12) {
  console.log("Usage: node scripts/mnemonic-to-secret.js \"word1 word2 ... word12\"");
  console.log("\nGet your recovery phrase from Freighter → Settings → Show Recovery Phrase");
  process.exit(1);
}

try {
  const wallet = StellarHDWallet.fromMnemonic(mnemonic);
  const keypair = wallet.getKeypair(0); // First account (index 0)

  console.log("\n🔑 Derived from recovery phrase:\n");
  console.log(`   Public Key:  ${keypair.publicKey()}`);
  console.log(`   Secret Key:  ${keypair.secret()}`);
  console.log(`\n   ⚠️  Keep the secret key safe. Never share it.`);
  console.log(`   ✅ Use this secret key as AGENT_STELLAR_SECRET in .cursor/mcp.json\n`);
} catch (e) {
  console.error("❌ Invalid mnemonic:", e.message);
}
