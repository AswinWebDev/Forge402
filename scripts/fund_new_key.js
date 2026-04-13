import { Keypair } from "@stellar/stellar-sdk";
import fs from "fs";

const env = fs.readFileSync("../.env", "utf8");
const match = env.match(/USER_TESTNET_SECRET=(.+)/);
if (match) {
    const pub = Keypair.fromSecret(match[1].trim()).publicKey();
    console.log("Funding generated testnet wallet: " + pub);
    fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(pub)}`)
      .then(res => res.json())
      .then(json => console.log("Funded!"))
      .catch(e => console.error(e));
}
