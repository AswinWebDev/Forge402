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
      const res = await apiFetch('/api/missions/run', {
        method: 'POST',
        body: JSON.stringify({ request: missionInput, max_budget: Number(missionBudget) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMissionResult({ error: data.error || 'Mission failed' });
      } else {
        setMissionResult(data);
      }
      loadAll();
      // Scroll to results
      setTimeout(() => document.getElementById('mission-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24, alignItems: 'stretch' }}>
        {/* Your Agents */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🤖 Your Agents</h3>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320 }}>
          {agents.length > 0 ? agents.slice(0, 8).map(a => (
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
        </div>

        {/* Live Payment Feed */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pulse-dot green" /> Live Payment Feed
          </h3>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320 }}>
            {payments.length > 0 ? payments.map((p, i) => (
              <a key={p.id || i} href={p.verify_url} target="_blank" rel="noopener"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, marginBottom: 4, background: 'var(--bg-primary)', textDecoration: 'none', transition: 'background 0.2s' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.service}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{new Date(p.timestamp).toLocaleTimeString()}</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
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
            onKeyDown={e => e.key === 'Enter' && !missionLoading && runMission()}
            disabled={missionLoading}
          />
          <input className="form-input" type="number" step="0.01" value={missionBudget} onChange={e => setMissionBudget(e.target.value)} style={{ width: 100 }} disabled={missionLoading} />
          <button className="btn btn-primary" onClick={runMission} disabled={missionLoading || !connected} style={{ minWidth: 120 }}>
            {missionLoading ? '⏳ Running...' : '🚀 Run'}
          </button>
        </div>

        {/* Loading State */}
        {missionLoading && (
          <div style={{ padding: '24px 20px', background: 'rgba(79, 138, 255, 0.06)', border: '1px solid rgba(79, 138, 255, 0.15)', borderRadius: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                border: '2px solid rgba(79, 138, 255, 0.3)',
                borderTopColor: 'var(--blue)',
                animation: 'spin 0.8s linear infinite',
              }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Mission in progress...</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
              <div>🧠 Venice AI is planning which tools to call...</div>
              <div>💳 x402 payments being signed on Stellar...</div>
              <div>📊 This typically takes 15-30 seconds.</div>
            </div>
            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Mission Result */}
        {missionResult && !missionLoading && (
          <div id="mission-result" style={{ marginTop: 16 }}>
            {missionResult.error ? (
              <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 12, fontSize: 13, color: 'var(--red)' }}>
                ❌ Error: {missionResult.error}
              </div>
            ) : (
              <>
                <div style={{ padding: '16px 20px', background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.15)', borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', marginBottom: 10 }}>✅ Mission Complete</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div className="badge badge-green">Spent: ${missionResult.budget?.spent?.toFixed(2)}</div>
                    <div className="badge badge-blue">{missionResult.payments?.length} tools used</div>
                    <div className="badge badge-purple">Budget left: ${missionResult.budget?.remaining?.toFixed(2)}</div>
                    {missionResult.attestation && <div className="badge badge-amber">🔗 {missionResult.attestation.hash?.slice(0, 12)}...</div>}
                  </div>
                </div>
                {missionResult.payments?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>PAYMENT RECEIPTS</div>
                    {missionResult.payments.map((p, i) => (
                      <a key={i} href={p.verify_url} target="_blank" rel="noopener" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--blue)', padding: '6px 12px', background: 'var(--bg-primary)', borderRadius: 8, marginBottom: 4, textDecoration: 'none' }}>
                        <span>{p.service}</span>
                        <span style={{ color: 'var(--green)' }}>${p.cost?.toFixed(2)} → TX {p.tx_hash?.slice(0, 16)}... ↗</span>
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>INTELLIGENCE REPORT</div>
                <div className="report-viewer" style={{ maxHeight: 500 }}>{missionResult.report}</div>
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
                  <tr key={i} onClick={() => setMissionResult({ 
                      budget: { spent: m.spent, remaining: balance }, 
                      payments: m.payments || [], 
                      report: m.report || "Looking back... (No report data was saved for this older mission!)", 
                      attestation: m.attestation
                  })} style={{ cursor: 'pointer', transition: 'background 0.2s' }} className="hover-row">
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
