'use client';
import { useState, useEffect } from 'react';
import { useWallet } from '../components/WalletProvider';
import Link from 'next/link';

export default function OverviewPage() {
  const { wallet, balance, connected, apiFetch, API } = useWallet();
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [missions, setMissions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [missionInput, setMissionInput] = useState('');
  const [missionBudget, setMissionBudget] = useState('1.00');
  const [missionResult, setMissionResult] = useState(null);
  const [missionLoading, setMissionLoading] = useState(false);

  const loadAll = async () => {
    try {
      const [statsRes, paymentsRes, missionsRes, agentsRes] = await Promise.all([
        fetch(`${API}/api/stats`),
        fetch(`${API}/api/payments?limit=20`),
        apiFetch('/api/missions'),
        apiFetch('/api/agents'),
      ]);
      setStats(await statsRes.json());
      setPayments((await paymentsRes.json()).payments || []);
      setMissions((await missionsRes.json()).missions || []);
      setAgents((await agentsRes.json()).agents || []);
    } catch {}
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 8000);
    return () => clearInterval(interval);
  }, [wallet]);

  const runMission = async () => {
    if (!missionInput.trim()) return;
    if (!connected) { alert('Connect your wallet first (Wallet tab)'); return; }
    setMissionLoading(true);
    setMissionResult(null);
    try {
      const res = await apiFetch('/api/mission', {
        method: 'POST',
        body: JSON.stringify({ request: missionInput, max_budget: Number(missionBudget) }),
      });
      setMissionResult(await res.json());
      loadAll();
    } catch (e) {
      setMissionResult({ error: e.message });
    }
    setMissionLoading(false);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {connected
            ? `Connected: ${wallet.slice(0, 8)}...${wallet.slice(-4)} · $${balance.toFixed(2)} credits`
            : 'Connect your wallet to see your agents and missions'}
        </p>
      </div>

      {!connected && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(79,138,255,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 32 }}>🔗</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Connect Your Stellar Wallet</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Connect your wallet to deploy agents, run missions, and view your activity.
              </p>
            </div>
            <Link href="/dashboard/wallet" className="btn btn-primary">Connect Wallet →</Link>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Your Agents</div>
          <div className="stat-value blue">{agents.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Running</div>
          <div className="stat-value green">{agents.filter(a => a.status === 'running').length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Your Missions</div>
          <div className="stat-value purple">{missions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Platform Payments</div>
          <div className="stat-value amber">{stats?.payments?.total_payments ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">USDC Settled</div>
          <div className="stat-value green">${stats?.payments?.total_usdc_settled?.toFixed(2) ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Your Credits</div>
          <div className="stat-value blue">${balance.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Your Agents */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🤖 Your Agents</h3>
          {agents.length > 0 ? agents.slice(0, 5).map(a => (
            <Link key={a.id} href={`/dashboard/agents`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, marginBottom: 4, background: 'var(--bg-primary)', textDecoration: 'none' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Runs: {a.total_runs} · Spent: ${a.total_spent?.toFixed(2)}</div>
              </div>
              <span className={`badge ${a.status === 'running' ? 'badge-green' : 'badge-amber'}`}>{a.status}</span>
            </Link>
          )) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              {connected ? 'No agents yet. Deploy one from the Agents tab.' : 'Connect wallet to see your agents.'}
            </p>
          )}
        </div>

        {/* Live Payment Feed */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pulse-dot green" /> Live Payment Feed
          </h3>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {payments.length > 0 ? payments.map((p, i) => (
              <a key={p.id || i} href={p.verify_url} target="_blank" rel="noopener"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, marginBottom: 4, background: 'var(--bg-primary)', textDecoration: 'none', transition: 'background 0.2s' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.service}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{new Date(p.timestamp).toLocaleTimeString()}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent-teal)' }}>
                  ${p.cost?.toFixed(2)}
                </div>
              </a>
            )) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No payments yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Mission Runner */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🧠 Run a Mission</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Run a one-off intelligence mission. The orchestrator plans which tools to use, pays via x402, and synthesizes a report.
          {connected && ` Cost deducted from your credits ($${balance.toFixed(2)} available).`}
        </p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input
            className="form-input"
            value={missionInput}
            onChange={e => setMissionInput(e.target.value)}
            placeholder="e.g. Analyze VVV token — price, GitHub audit, website research"
            style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && runMission()}
          />
          <input className="form-input" type="number" step="0.01" value={missionBudget} onChange={e => setMissionBudget(e.target.value)} style={{ width: 100 }} />
          <button className="btn btn-primary" onClick={runMission} disabled={missionLoading || !connected}>
            {missionLoading ? '⏳ Running...' : '🚀 Run'}
          </button>
        </div>

        {missionResult && (
          <div style={{ marginTop: 16 }}>
            {missionResult.error ? (
              <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--accent-red)' }}>
                Error: {missionResult.error}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div className="badge badge-green">Spent: ${missionResult.budget?.spent?.toFixed(2)}</div>
                  <div className="badge badge-blue">{missionResult.payments?.length} tools</div>
                  {missionResult.attestation && <div className="badge badge-amber">🔗 {missionResult.attestation.hash?.slice(0, 12)}...</div>}
                </div>
                {missionResult.payments?.map((p, i) => (
                  <a key={i} href={p.verify_url} target="_blank" rel="noopener" style={{ display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', padding: '4px 0' }}>
                    {p.service}: ${p.cost?.toFixed(2)} → TX {p.tx_hash?.slice(0, 16)}... ↗
                  </a>
                ))}
                <div className="report-viewer" style={{ marginTop: 12, maxHeight: 400 }}>{missionResult.report}</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Recent Missions */}
      {missions.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📋 Your Missions</h3>
          <div className="table-container">
            <table>
              <thead><tr><th>Request</th><th>Tools</th><th>Spent</th><th>Attestation</th><th>Time</th></tr></thead>
              <tbody>
                {missions.slice(0, 10).map((m, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.request}</td>
                    <td><span className="badge badge-blue">{m.tools_used}</span></td>
                    <td className="price-tag">${m.spent?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{m.attestation?.hash?.slice(0, 12) || '—'}...</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.timestamp ? new Date(m.timestamp).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
