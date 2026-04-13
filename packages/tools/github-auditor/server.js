/**
 * AgentHub v3 — GitHub Auditor Service
 * x402-protected Express server that provides deep repository analysis.
 * 
 * Endpoint: GET /api/audit?repo=bitcoin/bitcoin
 * Price: $0.05 USDC per request
 * Data: Repo info, commit activity, contributors, languages, security policy, open issues
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

const PORT = process.env.AUDITOR_SERVICE_PORT || 4002;
const PRICE = "$0.05";
const NETWORK = "stellar:testnet";
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://www.x402.org/facilitator";
const PAY_TO = process.env.STELLAR_PROVIDER_PUBLIC;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!PAY_TO) {
  console.error("❌ STELLAR_PROVIDER_PUBLIC not set in .env");
  process.exit(1);
}

const ghHeaders = {
  "Accept": "application/vnd.github.v3+json",
  ...(GITHUB_TOKEN ? { "Authorization": `Bearer ${GITHUB_TOKEN}` } : {}),
};

const app = express();

// Service discovery endpoint (free)
app.get("/", (_, res) => res.json({
  service: "AgentHub GitHub Auditor Service",
  version: "3.0.0",
  route: "/api/audit",
  price: PRICE,
  network: NETWORK,
  description: "Deep GitHub repository audit. Analyzes commit velocity, contributors, language breakdown, security policies, and open issues. Returns a structured trust report.",
  params: "?repo=owner/repo (e.g. ?repo=stellar/soroban-sdk)"
}));

// x402 paywall middleware
app.use(
  paymentMiddlewareFromConfig(
    {
      ["GET /api/audit"]: {
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

// Protected endpoint — real GitHub analysis
app.get("/api/audit", async (req, res) => {
  try {
    const repo = req.query.repo;
    if (!repo || !repo.includes("/")) {
      return res.status(400).json({ error: "Provide ?repo=owner/repo" });
    }

    // Parallel fetch: repo info, commits, contributors, languages, community
    const [repoRes, commitsRes, contribRes, langRes, communityRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}`, { headers: ghHeaders }),
      fetch(`https://api.github.com/repos/${repo}/commits?per_page=30`, { headers: ghHeaders }),
      fetch(`https://api.github.com/repos/${repo}/contributors?per_page=10`, { headers: ghHeaders }),
      fetch(`https://api.github.com/repos/${repo}/languages`, { headers: ghHeaders }),
      fetch(`https://api.github.com/repos/${repo}/community/profile`, { headers: ghHeaders }),
    ]);

    const repoData = await repoRes.json();
    const commits = await commitsRes.json();
    const contributors = await contribRes.json();
    const languages = await langRes.json();
    const community = await communityRes.json();

    if (repoData.message === "Not Found") {
      return res.json({ error: `Repository not found: ${repo}`, audit: null });
    }

    // Calculate commit velocity (commits per week from last 30)
    const commitDates = Array.isArray(commits) ? commits.map(c => new Date(c.commit?.author?.date)) : [];
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentCommits = commitDates.filter(d => d > oneWeekAgo).length;

    const audit = {
      repository: repo,
      full_name: repoData.full_name,
      description: repoData.description,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      open_issues: repoData.open_issues_count,
      created_at: repoData.created_at,
      last_push: repoData.pushed_at,
      license: repoData.license?.name || "No license",
      default_branch: repoData.default_branch,
      commit_velocity: {
        recent_commits_last_7d: recentCommits,
        total_sampled: Array.isArray(commits) ? commits.length : 0,
        assessment: recentCommits > 5 ? "VERY_ACTIVE" : recentCommits > 1 ? "ACTIVE" : "STALE",
      },
      top_contributors: Array.isArray(contributors) ? contributors.slice(0, 5).map(c => ({
        login: c.login,
        contributions: c.contributions,
      })) : [],
      languages: languages,
      security: {
        has_security_policy: community.files?.security_policy ? true : false,
        has_code_of_conduct: community.files?.code_of_conduct ? true : false,
        has_contributing_guide: community.files?.contributing ? true : false,
      },
      trust_score: calculateTrustScore(repoData, recentCommits, community),
    };

    return res.json({ audit });
  } catch (err) {
    return res.status(500).json({ error: err.message, audit: null });
  }
});

function calculateTrustScore(repo, recentCommits, community) {
  let score = 0;
  // Stars (max 20)
  score += Math.min(20, Math.floor(repo.stargazers_count / 100));
  // Forks (max 15)
  score += Math.min(15, Math.floor(repo.forks_count / 50));
  // Commit velocity (max 25)
  score += Math.min(25, recentCommits * 5);
  // License (10)
  if (repo.license) score += 10;
  // Security policy (10)
  if (community.files?.security_policy) score += 10;
  // Contributing guide (5)
  if (community.files?.contributing) score += 5;
  // Code of conduct (5)
  if (community.files?.code_of_conduct) score += 5;
  // Age bonus (max 10) — older repos are more trustworthy
  const ageYears = (Date.now() - new Date(repo.created_at).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  score += Math.min(10, Math.floor(ageYears * 2));

  return { score: Math.min(100, score), max: 100, rating: score >= 70 ? "HIGH_TRUST" : score >= 40 ? "MODERATE" : "LOW_TRUST" };
}

app.listen(Number(PORT), () => {
  console.log(`🔍 GitHub Auditor Service running on http://localhost:${PORT}`);
  console.log(`   Paywall: ${PRICE} USDC per request → ${PAY_TO?.slice(0, 8)}...`);
});
