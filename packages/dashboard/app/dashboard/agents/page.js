'use client';
import { useState, useEffect } from 'react';
import { useWallet } from '../../components/WalletProvider';
import Link from 'next/link';

export default function AgentsPage() {
  const { wallet, balance, connected, apiFetch, getHeaders, API } = useWallet();
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentDetail, setAgentDetail] = useState(null);
  const [showDeploy, setShowDeploy] = useState(false);
  const [showTopUp, setShowTopUp] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState('1.00');
  const [budgetEstimate, setBudgetEstimate] = useState(null);
  const [form, setForm] = useState({ name: '', goal: '', schedule_minutes: 60, credit_deposit: 1.00, webhook_url: '' });
  const [message, setMessage] = useState('');

  const loadAgents = async () => {
    try {
      const res = await apiFetch('/api/agents');
      const data = await res.json();
      setAgents(data.agents || []);
    } catch {}
  };

  useEffect(() => {
    loadAgents();
    fetch(`${API}/api/budget-estimate`).then(r => r.json()).then(setBudgetEstimate).catch(() => {});
    const interval = setInterval(loadAgents, 8000);
    return () => clearInterval(interval);
  }, [wallet]);

  const handleDeploy = async (e) => {
    e.preventDefault();
    if (!connected) { setMessage('❌ Connect your wallet first (Wallet tab)'); return; }
    setMessage('');
    try {
      const res = await fetch(`${API}/api/agents`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: form.name,
          goal: form.goal,
          schedule_minutes: Number(form.schedule_minutes),
          credit_deposit: Number(form.credit_deposit),
          webhook_url: form.webhook_url || undefined,
          wallet: wallet,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('✅ ' + data.message);
        setForm({ name: '', goal: '', schedule_minutes: 60, credit_deposit: 1.00, webhook_url: '' });
        setTimeout(() => { setShowDeploy(false); setMessage(''); loadAgents(); }, 2000);
      } else {
        setMessage('❌ ' + data.error);
      }
    } catch { setMessage('❌ Network error'); }
  };

  const handleTopUp = async (agentId) => {
    const amount = Number(topUpAmount);
    if (!amount || amount < 0.01) return;
    const res = await fetch(`${API}/api/agents/${agentId}/deposit`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ amount, wallet }),
    });
    if (res.ok) {
      setShowTopUp(null);
      loadAgents();
      if (selectedAgent === agentId) viewAgent(agentId);
    } else {
      const data = await res.json();
      alert(data.error || 'Top-up failed');
    }
  };

  const viewAgent = async (id) => {
    setSelectedAgent(id);
    const res = await apiFetch(`/api/agents/${id}`);
    const data = await res.json();
    setAgentDetail(data.agent);
  };

  const pauseAgent = async (id) => {
    await fetch(`${API}/api/agents/${id}/pause`, { method: 'PATCH', headers: getHeaders() });
    loadAgents();
    if (selectedAgent === id) viewAgent(id);
  };

  const resumeAgent = async (id) => {
    const res = await fetch(`${API}/api/agents/${id}/resume`, { method: 'PATCH', headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) alert(data.error || 'Cannot resume');
    loadAgents();
    if (selectedAgent === id) viewAgent(id);
  };

  const deleteAgent = async (id) => {
    if (!confirm('Remove this agent?')) return;
    await fetch(`${API}/api/agents/${id}`, { method: 'DELETE', headers: getHeaders() });
    setSelectedAgent(null);
    setAgentDetail(null);
    loadAgents();
  };

  const costPerRun = budgetEstimate?.suggested || 0.15;
  const estRuns = Math.floor(Number(form.credit_deposit) / costPerRun);

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Autonomous Agents</h1>
          <p className="page-subtitle">
            {connected
              ? `${agents.length} deployed · ${agents.filter(a => a.status === 'running').length} running · $${balance.toFixed(2)} credits`
              : 'Connect your wallet to manage agents'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowDeploy(true)} disabled={!connected}>+ Deploy Agent</button>
      </div>

      {!connected && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(79,138,255,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 32 }}>🔗</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Connect Your Wallet</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Connect your Stellar wallet to deploy and manage agents.</p>
            </div>
            <Link href="/dashboard/wallet" className="btn btn-primary">Connect Wallet →</Link>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selectedAgent ? '1fr 1fr' : '1fr', gap: 20 }}>
        <div>
          {agents.map(agent => (
            <div key={agent.id} className="card" style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => viewAgent(agent.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {agent.name}
                    <span className={`badge ${agent.status === 'running' ? 'badge-green' : agent.pause_reason === 'credits_depleted' ? 'badge-red' : 'badge-amber'}`}>
                      {agent.status === 'paused' && agent.pause_reason === 'credits_depleted' ? '⚠ no credits' : agent.status}
                    </span>
                    {agent.deployed_via === 'x402' && <span className="badge badge-purple">x402</span>}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{agent.goal?.slice(0, 80)}{agent.goal?.length > 80 ? '...' : ''}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 90 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: agent.credits_remaining > 0.05 ? 'var(--green)' : 'var(--red)' }}>
                    ${agent.credits_remaining?.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{agent.total_runs} runs · ${agent.total_spent?.toFixed(2)} used</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {agent.status === 'running' ? (
                  <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); pauseAgent(agent.id); }}>⏸ Pause</button>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); resumeAgent(agent.id); }}>▶ Resume</button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setShowTopUp(agent.id); setTopUpAmount('1.00'); }}>💳 Top Up</button>
                <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); deleteAgent(agent.id); }}>🗑</button>
              </div>
            </div>
          ))}

          {agents.length === 0 && connected && (
            <div className="empty-state">
              <div className="empty-state-icon">🤖</div>
              <h3>No agents deployed</h3>
              <p>Deploy your first autonomous agent. It runs 24/7, discovers tools, pays via x402, and delivers reports.</p>
            </div>
          )}
        </div>

        {selectedAgent && agentDetail && (
          <div className="card" style={{ position: 'sticky', top: 32, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{agentDetail.name}</h3>

            {agentDetail.owner_wallet && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
                Owner: {agentDetail.owner_wallet.slice(0, 8)}...{agentDetail.owner_wallet.slice(-4)}
              </div>
            )}

            <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Credits remaining</span>
                <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: agentDetail.credits_remaining > 0.05 ? 'var(--green)' : 'var(--red)' }}>
                  ${agentDetail.credits_remaining?.toFixed(2)} / ${agentDetail.credit_balance?.toFixed(2)}
                </span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${Math.max(0, Math.min(100, (agentDetail.credits_remaining / (agentDetail.credit_balance || 1)) * 100))}%`,
                  background: agentDetail.credits_remaining > 0.10 ? 'var(--green)' : 'var(--red)',
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                ~{Math.floor(agentDetail.credits_remaining / (agentDetail.max_budget_per_run || 0.15))} runs remaining
              </div>
            </div>

            <div style={{ fontSize: 13, lineHeight: 2, marginBottom: 20 }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Goal:</span> {agentDetail.goal}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Schedule:</span> Every {agentDetail.schedule_minutes} min</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Budget/run:</span> ${agentDetail.max_budget_per_run?.toFixed(2)}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Total runs:</span> {agentDetail.total_runs}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Total spent:</span> <span style={{ fontWeight: 700 }}>${agentDetail.total_spent?.toFixed(2)}</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Last run:</span> {agentDetail.last_run ? new Date(agentDetail.last_run).toLocaleString() : 'Never'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Deployed via:</span> <span className={`badge ${agentDetail.deployed_via === 'x402' ? 'badge-purple' : 'badge-blue'}`}>{agentDetail.deployed_via || 'dashboard'}</span></div>
              {agentDetail.pause_reason && agentDetail.status === 'paused' && (
                <div style={{ color: 'var(--accent-amber)', fontWeight: 600, marginTop: 4 }}>
                  ⚠️ {agentDetail.pause_reason === 'credits_depleted' || agentDetail.pause_reason === 'insufficient_credits' ? 'Credits depleted — top up to resume' : `Paused (${agentDetail.pause_reason})`}
                </div>
              )}
            </div>

            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📋 Reports ({(agentDetail.reports || []).length})</h4>
            {(agentDetail.reports || []).slice().reverse().map((report, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  {new Date(report.timestamp).toLocaleString()} · ${report.budget?.spent?.toFixed(2)} USDC · {report.payments?.length} tools
                  {report.attestation && <span> · 🔗 {report.attestation.hash?.slice(0, 10)}...</span>}
                </div>
                <div className="report-viewer" style={{ maxHeight: 200 }}>
                  {report.report?.slice(0, 800)}
                  {report.report?.length > 800 ? '\n\n... (truncated)' : ''}
                </div>
                {report.payments?.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11 }}>
                    {report.payments.map((p, j) => (
                      <a key={j} href={p.verify_url} target="_blank" rel="noopener" style={{ display: 'block', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                        {p.service}: ${p.cost?.toFixed(2)} → TX {p.tx_hash?.slice(0, 12)}... ↗
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {(!agentDetail.reports || agentDetail.reports.length === 0) && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No reports yet. First run in progress...</p>
            )}
          </div>
        )}
      </div>

      {/* Deploy Modal */}
      {showDeploy && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDeploy(false)}>
          <div className="modal">
            <div className="modal-title">Deploy Autonomous Agent</div>

            <div style={{ padding: '14px 16px', background: 'rgba(79, 138, 255, 0.06)', border: '1px solid rgba(79, 138, 255, 0.15)', borderRadius: 10, marginBottom: 20, fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: 'var(--accent-blue)', marginBottom: 6 }}>💡 How it works</div>
              <div>1. Credits deducted from your wallet balance</div>
              <div>2. Agent runs on schedule, calling x402 tools autonomously</div>
              <div>3. Each run costs ~<strong>${costPerRun.toFixed(2)}</strong> ({budgetEstimate?.tool_count || '?'} tools)</div>
              <div>4. When credits run out, agent pauses. Top up anytime.</div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                Your balance: ${balance.toFixed(2)} credits
              </div>
            </div>

            {message && <p style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: message.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', fontSize: 13 }}>{message}</p>}
            <form onSubmit={handleDeploy}>
              <div className="form-group">
                <label className="form-label">Agent Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. VVV Price Watchdog" required />
              </div>
              <div className="form-group">
                <label className="form-label">Goal *</label>
                <textarea className="form-textarea" value={form.goal} onChange={e => setForm({...form, goal: e.target.value})} placeholder="Be specific! e.g. 'Look up VVV token price, market cap, and volume. Alert me if the price drops below $5.'" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Run every (minutes)</label>
                  <input className="form-input" type="number" value={form.schedule_minutes} onChange={e => setForm({...form, schedule_minutes: e.target.value})} min="1" />
                </div>
                <div className="form-group">
                  <label className="form-label">Credit Deposit (USDC) *</label>
                  <input className="form-input" type="number" step="0.01" min="0.01" value={form.credit_deposit} onChange={e => setForm({...form, credit_deposit: e.target.value})} required />
                </div>
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 8, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>~{estRuns} runs with ${Number(form.credit_deposit).toFixed(2)}</span>
                <span style={{ color: 'var(--text-muted)' }}>@ ~${costPerRun.toFixed(2)}/run</span>
              </div>
              <div className="form-group">
                <label className="form-label">Webhook URL (optional)</label>
                <input className="form-input" value={form.webhook_url} onChange={e => setForm({...form, webhook_url: e.target.value})} placeholder="https://hooks.slack.com/..." />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDeploy(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">🚀 Deploy (${Number(form.credit_deposit).toFixed(2)})</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top-Up Modal */}
      {showTopUp && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowTopUp(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-title">💳 Top Up Credits</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Add credits from your wallet balance (${balance.toFixed(2)} available).</p>
            <div className="form-group">
              <label className="form-label">Amount (USDC)</label>
              <input className="form-input" type="number" step="0.01" min="0.01" value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>~{Math.floor(Number(topUpAmount) / costPerRun)} additional runs</p>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowTopUp(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleTopUp(showTopUp)}>Add ${Number(topUpAmount).toFixed(2)}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
