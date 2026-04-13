'use client';
import { useState, useEffect } from 'react';
import { useWallet } from '../../components/WalletProvider';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ToolsPage() {
  const { wallet } = useWallet();
  const [tools, setTools] = useState([]);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', endpoint: '', method: 'GET',
    price: '', category: 'market-data', params: '',
    post_body: '', provider_wallet: '',
  });
  const [message, setMessage] = useState('');

  const loadTools = () => fetch(`${API}/api/tools`).then(r => r.json()).then(d => setTools(d.tools || [])).catch(() => {});
  useEffect(() => { loadTools(); }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const submitData = {
        ...form,
        provider_wallet: form.provider_wallet || wallet,
      };
      const res = await fetch(`${API}/api/tools/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('✅ ' + data.message);
        setForm({ name: '', description: '', endpoint: '', method: 'GET', price: '', category: 'market-data', params: '', post_body: '', provider_wallet: '' });
        setTimeout(() => { setShowRegister(false); setMessage(''); loadTools(); }, 2000);
      } else {
        setMessage('❌ ' + data.error);
      }
    } catch { setMessage('❌ Network error'); }
  };

  const categoryColors = {
    'market-data': 'badge-blue', 'code-audit': 'badge-purple',
    'web-scraping': 'badge-amber', 'on-chain-analytics': 'badge-green',
    'ai-inference': 'badge-red', 'general': 'badge-blue',
  };

  const categoryIcons = {
    'market-data': '📊', 'code-audit': '🔍', 'web-scraping': '🌐',
    'on-chain-analytics': '⛓️', 'ai-inference': '🧠', 'general': '🔧',
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Tool Marketplace</h1>
          <p className="page-subtitle">{tools.length} x402-paywalled services — agents pay USDC per request</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowRegister(true)}>+ Register Tool</button>
      </div>

      {/* How x402 Tools Work */}
      <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid var(--accent-blue)' }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>How x402 Tools Work</h4>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div>1. Agent calls tool endpoint → gets <strong>HTTP 402</strong> (payment required)</div>
          <div>2. Agent signs USDC payment via x402 → retries with payment header</div>
          <div>3. x402 facilitator verifies + settles payment on Stellar</div>
          <div>4. Tool returns data → agent gets response</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>💡 Tool providers receive USDC directly to their Stellar wallet per request.</div>
        </div>
      </div>

      {/* Tool Cards */}
      <div className="card-grid">
        {tools.map(tool => (
          <div key={tool.id} className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{categoryIcons[tool.category] || '🔧'} {tool.name}</div>
                <span className={`badge ${categoryColors[tool.category] || 'badge-blue'}`}>{tool.category}</span>
              </div>
              <div className="price-tag">${tool.price} USDC</div>
            </div>
            <p className="card-description">{tool.description}</p>
            {tool.params && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-blue)' }}>
                {tool.method} {tool.params}
              </div>
            )}
            <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              <div title={tool.endpoint}>{tool.method} {tool.endpoint?.length > 40 ? tool.endpoint.slice(0, 40) + '...' : tool.endpoint}</div>
              <div style={{ marginTop: 4 }}>Provider: {tool.provider_wallet?.slice(0, 8)}...{tool.provider_wallet?.slice(-6)}</div>
            </div>
          </div>
        ))}
      </div>

      {tools.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🔧</div>
          <h3>No tools registered yet</h3>
          <p>Register the first x402 tool to get started.</p>
        </div>
      )}

      {/* Registration Modal */}
      {showRegister && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowRegister(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-title">Register x402 Tool</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.7 }}>
              Your tool must be an <strong>x402-paywalled HTTP server</strong>. When agents call your endpoint,
              they automatically pay USDC to your Stellar wallet per request.
            </p>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 8, lineHeight: 1.7 }}>
              <strong>Requirements:</strong> Use <code>@x402/express</code> middleware to paywall your endpoint.
              See the <a href="https://developers.stellar.org/docs/build/agentic-payments/x402/quickstart-guide" target="_blank" rel="noopener" style={{ color: 'var(--accent-blue)' }}>x402 quickstart guide</a> for setup.
            </div>

            {message && <p style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: message.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', fontSize: 13 }}>{message}</p>}

            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">Tool Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Whale Alert Monitor" required />
              </div>
              <div className="form-group">
                <label className="form-label">Description *</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="What does your tool do? What data does it return? AI agents read this to decide when to use your tool." required rows={3} />
              </div>

              <div className="form-group">
                <label className="form-label">x402 Endpoint URL *</label>
                <input className="form-input" value={form.endpoint} onChange={e => setForm({...form, endpoint: e.target.value})} placeholder="https://my-tool.fly.dev/api/whales" required />
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>The URL agents will call. Must return 402 without payment and data with payment.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">HTTP Method</label>
                  <select className="form-select" value={form.method} onChange={e => setForm({...form, method: e.target.value})}>
                    <option>GET</option><option>POST</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Price per request (USDC) *</label>
                  <input className="form-input" type="number" step="0.01" min="0.001" max="5" value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder="0.05" required />
                </div>
              </div>

              {form.method === 'GET' && (
                <div className="form-group">
                  <label className="form-label">Query Parameters</label>
                  <input className="form-input" value={form.params} onChange={e => setForm({...form, params: e.target.value})} placeholder="e.g. ?token=BTC&min_amount=1000000" />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Example query params the AI should use when calling this tool.</p>
                </div>
              )}

              {form.method === 'POST' && (
                <div className="form-group">
                  <label className="form-label">Request Body (JSON)</label>
                  <textarea className="form-textarea" value={form.post_body} onChange={e => setForm({...form, post_body: e.target.value})} placeholder={'{\n  "url": "https://example.com",\n  "depth": 2\n}'} rows={4} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Example JSON body the AI sends when calling this POST endpoint.</p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    <option value="market-data">📊 Market Data</option>
                    <option value="code-audit">🔍 Code Audit</option>
                    <option value="web-scraping">🌐 Web Scraping</option>
                    <option value="on-chain-analytics">⛓️ On-Chain Analytics</option>
                    <option value="ai-inference">🧠 AI Inference</option>
                    <option value="general">🔧 General</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Your Stellar Wallet *</label>
                  <input className="form-input" value={form.provider_wallet || wallet || ''} onChange={e => setForm({...form, provider_wallet: e.target.value})} placeholder="G... (receives USDC payments)" />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>USDC payments go directly to this wallet.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRegister(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Submit for Review</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
