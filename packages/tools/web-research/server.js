/**
 * AgentHub v3 — Web Research Service
 * x402-protected Express server for scraping and analyzing web content.
 * 
 * Endpoint: POST /api/research { "url": "https://example.com" }
 * Price: $0.02 USDC per request
 * Data: Stripped text content from any URL, useful for analyzing project websites
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

const PORT = process.env.RESEARCH_SERVICE_PORT || 4003;
const PRICE = "$0.02";
const NETWORK = "stellar:testnet";
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://www.x402.org/facilitator";
const PAY_TO = process.env.STELLAR_PROVIDER_PUBLIC;

if (!PAY_TO) {
  console.error("❌ STELLAR_PROVIDER_PUBLIC not set in .env");
  process.exit(1);
}

const app = express();
app.use(express.json());

// Service discovery endpoint (free)
app.get("/", (_, res) => res.json({
  service: "AgentHub Web Research Service",
  version: "3.0.0",
  route: "/api/research",
  method: "POST",
  price: PRICE,
  network: NETWORK,
  description: "Fetches and extracts readable text content from any URL. Strips HTML to plain text. Useful for analyzing project websites, whitepapers, and documentation pages that LLMs cannot access directly.",
  body: '{ "url": "https://example.com" }'
}));

// x402 paywall middleware
app.use(
  paymentMiddlewareFromConfig(
    {
      ["POST /api/research"]: {
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

// Simple HTML to text stripper
function htmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

// Protected endpoint — real web scraping
app.post("/api/research", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Provide { url: 'https://...' } in request body" });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "AgentHub-WebResearch/3.0 (Stellar x402 Service)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return res.json({ error: `Failed to fetch: HTTP ${response.status}`, url, content: null });
    }

    const html = await response.text();
    const text = htmlToText(html);

    // Extract metadata from HTML
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

    return res.json({
      url,
      title: titleMatch ? titleMatch[1].trim() : "Unknown",
      meta_description: descMatch ? descMatch[1].trim() : "None",
      content_length: text.length,
      content: text.slice(0, 8000), // Cap at 8KB to stay within reasonable limits
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, url: req.body?.url, content: null });
  }
});

app.listen(Number(PORT), () => {
  console.log(`🌐 Web Research Service running on http://localhost:${PORT}`);
  console.log(`   Paywall: ${PRICE} USDC per request → ${PAY_TO?.slice(0, 8)}...`);
});
