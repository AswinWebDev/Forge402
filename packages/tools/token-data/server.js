/**
 * AgentHub v3 — Token Data Service
 * x402-protected Express server that provides deep crypto token metrics.
 * 
 * Endpoint: GET /api/token-data?query=bitcoin
 * Price: $0.01 USDC per request
 * Data: CoinGecko deep metrics (price, market cap, volume, GitHub URL, contract address)
 */
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const PORT = process.env.TOKEN_SERVICE_PORT || 4001;
const PRICE = "$0.01";
const NETWORK = "stellar:testnet";
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://www.x402.org/facilitator";
const PAY_TO = process.env.STELLAR_PROVIDER_PUBLIC;

if (!PAY_TO) {
  console.error("❌ STELLAR_PROVIDER_PUBLIC not set in .env. Run scripts/setup-wallets.js first.");
  process.exit(1);
}

const app = express();

// Service discovery endpoint (free)
app.get("/", (_, res) => res.json({
  service: "AgentHub Token Data Service",
  version: "3.0.0",
  route: "/api/token-data",
  price: PRICE,
  network: NETWORK,
  description: "Deep crypto token metrics from CoinGecko. Search by name/symbol. Returns price, market cap, 24h volume, GitHub URL, contract address, FDV, and circulating supply.",
  params: "?query=bitcoin or ?query=VVV or ?top=5 for trending"
}));

// x402 paywall middleware
app.use(
  paymentMiddlewareFromConfig(
    {
      ["GET /api/token-data"]: {
        accepts: {
          scheme: "exact",
          price: PRICE,
          network: NETWORK,
          payTo: PAY_TO,
        },
      },
    },
    new HTTPFacilitatorClient({ url: FACILITATOR_URL }),
    [{ network: NETWORK, server: new ExactStellarScheme() }],
  ),
);

// Protected endpoint — real CoinGecko data
app.get("/api/token-data", async (req, res) => {
  try {
    const query = req.query.query;
    const top = parseInt(req.query.top) || 0;

    if (query) {
      // Search for a specific token
      const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
      const searchData = await searchRes.json();

      if (!searchData.coins || searchData.coins.length === 0) {
        return res.json({ error: `No token found matching: ${query}`, results: [] });
      }

      const bestMatch = searchData.coins[0];
      const coinRes = await fetch(`https://api.coingecko.com/api/v3/coins/${bestMatch.id}`);
      const coinData = await coinRes.json();

      const result = {
        id: coinData.id,
        symbol: coinData.symbol,
        name: coinData.name,
        price_usd: coinData.market_data?.current_price?.usd,
        market_cap: coinData.market_data?.market_cap?.usd,
        volume_24h: coinData.market_data?.total_volume?.usd,
        circulating_supply: coinData.market_data?.circulating_supply,
        fdv: coinData.market_data?.fully_diluted_valuation?.usd,
        price_change_24h_pct: coinData.market_data?.price_change_percentage_24h,
        github_url: coinData.links?.repos_url?.github?.[0] || "unknown",
        homepage: coinData.links?.homepage?.[0] || "unknown",
        contract_address: coinData.contract_address || Object.values(coinData.platforms || {})[0] || "native",
        categories: coinData.categories || [],
        description: coinData.description?.en?.slice(0, 500) || "No description available.",
      };

      return res.json({ results: [result] });
    }

    if (top > 0) {
      // Get top N trending tokens
      const limit = Math.min(top, 25);
      const mktRes = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}`);
      const mktData = await mktRes.json();

      if (!Array.isArray(mktData)) {
        return res.json({ error: "CoinGecko rate limit exceeded. Try again in 60s.", results: [] });
      }

      const results = mktData.map(c => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        price_usd: c.current_price,
        market_cap: c.market_cap,
        volume_24h: c.total_volume,
        circulating_supply: c.circulating_supply,
        price_change_24h_pct: c.price_change_percentage_24h,
      }));

      return res.json({ results });
    }

    return res.json({ error: "Provide ?query=TOKEN_NAME or ?top=5", results: [] });
  } catch (err) {
    return res.status(500).json({ error: err.message, results: [] });
  }
});

app.listen(Number(PORT), () => {
  console.log(`🪙 Token Data Service running on http://localhost:${PORT}`);
  console.log(`   Paywall: ${PRICE} USDC per request → ${PAY_TO?.slice(0, 8)}...`);
});
