'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function LandingPage() {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = () => {
      fetch(`${API}/api/payments?limit=8`).then(r => r.json()).then(d => setPayments(d.payments || [])).catch(() => {});
      fetch(`${API}/api/stats`).then(r => r.json()).then(setStats).catch(() => {});
    };
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="landing-page">
      <div className="grid-bg" />

      {/* Nav */}
      <nav className="landing-nav">
        <div className="landing-nav-logo">
          <span className="logo-icon">⚡</span>
          <span>Forge402</span>
        </div>
        <div className="landing-nav-links">
          <Link href="/dashboard/docs">Docs</Link>
          <Link href="/dashboard/tools">Marketplace</Link>
          <a href="https://github.com/AswinWebDev/Forge402" target="_blank" rel="noopener">GitHub</a>
          <Link href="/dashboard/wallet" className="nav-cta">Connect Wallet →</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">
          <span className="pulse-dot" />
          Live on Stellar Testnet · Stellar Hacks 2026
        </div>
        <h1>
          Autonomous Agents<br />
          That <span className="accent">Forge</span> Other Agents
        </h1>
        <p>
          The decentralized marketplace where AI agents deploy sub-agents,
          discover tools, and pay via x402 micropayments on Stellar — producing
          verified intelligence reports without human intervention.
        </p>
        <div className="hero-actions">
          <Link href="/dashboard" className="hero-btn-primary">Launch App</Link>
          <Link href="/dashboard/docs" className="hero-btn-secondary">Read the Docs</Link>
        </div>

        {stats && (
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">{stats.tools?.approved || 0}</div>
              <div className="hero-stat-label">x402 Tools</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">{stats.agents?.deployed || 0}</div>
              <div className="hero-stat-label">Agents</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">{stats.payments?.total_payments || 0}</div>
              <div className="hero-stat-label">Payments</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">${stats.payments?.total_usdc_settled?.toFixed(2) || '0.00'}</div>
              <div className="hero-stat-label">USDC Settled</div>
            </div>
          </div>
        )}
      </section>

      {/* Live Payment Feed */}
      {payments.length > 0 && (
        <section className="live-feed-section">
          <div className="live-feed-header">
            <h3 className="live-feed-title">
              <span className="pulse-dot green" /> Live x402 Payments
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Auto-refreshing</span>
          </div>
          <div className="live-feed">
            {payments.map((p, i) => (
              <a key={p.id || i} href={p.verify_url} target="_blank" rel="noopener" className="feed-item">
                <div className="feed-icon">💳</div>
                <div className="feed-text">
                  <strong>{p.service}</strong> · {new Date(p.timestamp).toLocaleTimeString()}
                </div>
                <div className="feed-amount">${p.cost?.toFixed(2)} USDC</div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* For Agents / For Humans */}
      <section className="dual-section">
        <div className="feature-card">
          <div className="feature-card-icon">🤖</div>
          <h3>For AI Agents</h3>
          <p>Agents interact via x402-paywalled HTTP endpoints, MCP tools, or A2A discovery. Deploy sub-agents, pay for services, and receive intelligence — fully autonomous.</p>
          <div style={{ display: 'grid', gap: 6, marginTop: 18 }}>
            {[
              ['MCP Server', 'Cursor · Claude · VS Code'],
              ['A2A Protocol', 'Agent discovery'],
              ['llms.txt', 'Agent knowledge file'],
              ['POST /api/mission', '$0.10 USDC'],
              ['POST /api/agents/deploy', '$1.00 USDC'],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 12, border: '1px solid var(--border-subtle)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{title}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-card-icon">👤</div>
          <h3>For Humans</h3>
          <p>Manage your agent fleet visually. Deploy agents, register tools, monitor credits, and watch real-time x402 payments — all verifiable on Stellar.</p>
          <div style={{ display: 'grid', gap: 6, marginTop: 18 }}>
            {[
              ['Dashboard', 'Deploy, monitor & manage agents'],
              ['Freighter Wallet', 'Sign in with Stellar wallet'],
              ['Tool Marketplace', 'Register & browse x402 tools'],
              ['On-Chain Verification', 'Every payment on Stellar Explorer'],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 12, border: '1px solid var(--border-subtle)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{title}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="feature-card" style={{ gridColumn: '1 / -1', background: 'rgba(255,255,255,0.03)' }}>
          <div className="feature-card-icon">🏆</div>
          <h3>Judges: Test the MCP Server</h3>
          <p>Connect your Cursor IDE or Claude Desktop directly to our x402 tools using our Model Context Protocol server. Add this to your <code>mcpServers</code> config:</p>
          <pre style={{ background: '#0a0a0a', padding: 16, borderRadius: 8, fontSize: 12, marginTop: 12, overflowX: 'auto', border: '1px solid var(--border-subtle)' }}>
            <code>{`"forge402": {
  "command": "npm",
  "args": ["run", "mcp"],
  "cwd": "/path/to/Forge402",
  "env": {
    "AGENT_STELLAR_SECRET": "YOUR_SECRET_KEY",
    "AGENTHUB_URL": "http://localhost:4000" // Or our Cloud Run URL!
  }
}`}</code>
          </pre>
        </div>
      </section>

      {/* Architecture */}
      <section className="arch-section">
        <h2>How <span className="gradient-text">Forge402</span> Works</h2>
        <div className="arch-flow">
          <div className="arch-node">
            <div className="arch-node-icon">🤖</div>
            <div className="arch-node-title">Agent Request</div>
            <div className="arch-node-desc">Goal + wallet</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">🧠</div>
            <div className="arch-node-title">AI Orchestrator</div>
            <div className="arch-node-desc">Plans tools</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">💳</div>
            <div className="arch-node-title">x402 Payment</div>
            <div className="arch-node-desc">USDC on Stellar</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">🔧</div>
            <div className="arch-node-title">Tool Execution</div>
            <div className="arch-node-desc">Data returned</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">📊</div>
            <div className="arch-node-title">Report</div>
            <div className="arch-node-desc">Attested on-chain</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <h2>Infrastructure for the <span className="gradient-text">Agent Economy</span></h2>
        <p>Everything agents need to discover, pay, and operate autonomously on Stellar.</p>
        <div className="features-grid">
          {[
            { icon: '🏪', title: 'Tool Marketplace', desc: 'Deploy x402-protected services and earn USDC per request. Admin-curated, price-capped, open to all providers.' },
            { icon: '🤖', title: 'Agent-to-Agent Commerce', desc: 'Agents deploy sub-agents, top up credits, run missions — all via x402. No human required.' },
            { icon: '🛡️', title: 'Spending Guardrails', desc: 'Per-mission budgets. Price caps ($5 max). Auto-pause on depletion. Agents can\'t drain wallets.' },
            { icon: '🔗', title: 'On-Chain Attestations', desc: 'Every mission produces a SHA-256 hash anchored to Stellar transactions. Verifiable, auditable.' },
            { icon: '🧠', title: 'Venice AI Engine', desc: 'Privacy-first LLM plans tools, adapts mid-mission, synthesizes intelligence. Zero data retention.' },
            { icon: '🔌', title: 'MCP + A2A + HTTP', desc: 'Dashboard for humans, MCP for IDEs, A2A for discovery, llms.txt for agents. Four entry points.' },
          ].map(f => (
            <div key={f.title} className="feature-item">
              <div className="feature-item-icon">{f.icon}</div>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-text">
            ⚡ Forge402 · Autonomous x402 Agent Marketplace · Stellar Hacks 2026
          </div>
          <div className="landing-footer-links">
            <a href="https://stellar.org" target="_blank" rel="noopener">Stellar</a>
            <a href="https://x402.org" target="_blank" rel="noopener">x402</a>
            <a href="https://venice.ai" target="_blank" rel="noopener">Venice AI</a>
            <Link href="/dashboard/docs">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
