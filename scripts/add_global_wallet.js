import { Keypair } from "@stellar/stellar-sdk";
import fs from "fs";

const pair = Keypair.random();
fs.appendFileSync("../.env", "\nGLOBAL_TOOL_WALLET_ADDRESS=" + pair.publicKey() + "\n");
fs.appendFileSync("../.env", "GLOBAL_TOOL_WALLET_SECRET=" + pair.secret() + "\n");

console.log("Appended GLOBAL_TOOL_WALLET_ADDRESS=" + pair.publicKey());

fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(pair.publicKey())}`)
  .then(res => res.json())
  .then(json => console.log("Funded Global Tool Wallet with Friendbot!"))
  .catch(e => console.error(e));
