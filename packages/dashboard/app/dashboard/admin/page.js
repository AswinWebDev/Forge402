'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [pending, setPending] = useState([]);
  const [allTools, setAllTools] = useState([]);
  const [stats, setStats] = useState(null);

  const headers = { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey };

  const loadData = async () => {
    try {
      const [pRes, aRes, sRes] = await Promise.all([
        fetch(`${API}/api/tools/pending`, { headers }),
        fetch(`${API}/api/tools/all`, { headers }),
        fetch(`${API}/api/stats`),
      ]);
      if (pRes.ok) {
        setPending((await pRes.json()).tools || []);
        setAllTools((await aRes.json()).tools || []);
        setStats(await sRes.json());
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
      }
    } catch { setAuthenticated(false); }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    loadData();
  };

  const approveTool = async (id) => {
    await fetch(`${API}/api/tools/${id}/approve`, { method: 'POST', headers });
    loadData();
  };

  const rejectTool = async (id) => {
    const reason = prompt('Rejection reason:');
    await fetch(`${API}/api/tools/${id}/reject`, { method: 'POST', headers, body: JSON.stringify({ reason }) });
    loadData();
  };

  const deleteTool = async (id) => {
    if (!confirm('Remove this tool permanently?')) return;
    await fetch(`${API}/api/tools/${id}`, { method: 'DELETE', headers });
    loadData();
  };

  if (!authenticated) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-subtitle">Enter admin key to access platform management</p>
        </div>
        <div className="card" style={{ maxWidth: 400 }}>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Admin Key</label>
              <input className="form-input" type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)} placeholder="Enter admin key..." />
            </div>
            <button type="submit" className="btn btn-primary">🔐 Authenticate</button>
          </form>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Admin Panel</h1>
        <p className="page-subtitle">Manage tool approvals and platform settings</p>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Total Tools</div><div className="stat-value blue">{stats.tools?.total}</div></div>
          <div className="stat-card"><div className="stat-label">Approved</div><div className="stat-value green">{stats.tools?.approved}</div></div>
          <div className="stat-card"><div className="stat-label">Pending Review</div><div className="stat-value amber">{stats.tools?.pending}</div></div>
          <div className="stat-card"><div className="stat-label">Agents Running</div><div className="stat-value purple">{stats.agents?.running}</div></div>
        </div>
      )}

      {pending.length > 0 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>⏳ Pending Approvals</h2>
          <div className="card-grid" style={{ marginBottom: 40 }}>
            {pending.map(tool => (
              <div key={tool.id} className="card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                <div className="card-title">{tool.name}</div>
                <span className="badge badge-amber" style={{ marginBottom: 8 }}>pending</span>
                <p className="card-description">{tool.description}</p>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', margin: '12px 0' }}>
                  <div>{tool.method} {tool.endpoint}</div>
                  <div>Price: {tool.price}</div>
                  <div>Category: {tool.category}</div>
                  <div>Contact: {tool.contact}</div>
                  <div>Registered: {new Date(tool.registered_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => approveTool(tool.id)}>✅ Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => rejectTool(tool.id)}>❌ Reject</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>📋 All Registered Tools</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Category</th><th>Price</th><th>Status</th><th>Endpoint</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allTools.map(tool => (
              <tr key={tool.id}>
                <td style={{ fontWeight: 600 }}>{tool.name}</td>
                <td><span className="badge badge-blue">{tool.category}</span></td>
                <td className="price-tag">{tool.price}</td>
                <td>
                  <span className={`badge ${tool.status === 'approved' ? 'badge-green' : tool.status === 'pending' ? 'badge-amber' : 'badge-red'}`}>
                    {tool.status}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tool.endpoint}
                </td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteTool(tool.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
