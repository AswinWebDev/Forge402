import { Keypair } from "@stellar/stellar-sdk";
import fs from "fs";

const pair = Keypair.random();
fs.appendFileSync("../.env", "\nUSER_TESTNET_SECRET=" + pair.secret() + "\n");
console.log("Appended USER_TESTNET_SECRET=" + pair.secret());
