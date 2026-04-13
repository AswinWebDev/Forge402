import fs from "fs";
const env = fs.readFileSync(".env", "utf8");
if (!env.includes("USER_TESTNET_SECRET")) {
  fs.appendFileSync(".env", "\nUSER_TESTNET_SECRET=SB4SMYYXE6TEUKRIDIXP3TTH4E27CA4RFCBD3RK5DYHXDIJRPJTB6SEO\n");
}
