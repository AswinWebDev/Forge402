'use client';
import { useState, useEffect } from 'react';
import { useWallet } from '../../components/WalletProvider';

export default function WalletPage() {
  const {
    wallet, account, onChain, connected, authenticated,
    connectWallet, connectSecretKey,
    disconnect, depositCredits, refreshAccount, API, balance,
  } = useWallet();

  const [secretKey, setSecretKey] = useState('');
  const [connectError, setConnectError] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositResult, setDepositResult] = useState(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [platformWallet, setPlatformWallet] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [authMethod, setAuthMethod] = useState('wallet');

  useEffect(() => {
    fetch(`${API}/api/stats`).then(r => r.json()).then(d => setPlatformWallet(d.platform_wallet || '')).catch(() => {});
  }, [API]);

  useEffect(() => {
    if (wallet) {
      fetch(`${API}/api/account/${wallet}/transactions`).then(r => r.json()).then(d => setTransactions(d.transactions || [])).catch(() => {});
    }
  }, [wallet, API]);

  const handleWalletConnect = async () => {
    setConnectError('');
    setConnectLoading(true);
    try { await connectWallet(); } catch (e) { setConnectError(e.message); }
    setConnectLoading(false);
  };

  const handleSecretKey = async () => {
    setConnectError('');
    setConnectLoading(true);
    try { await connectSecretKey(secretKey.trim()); setSecretKey(''); } catch (e) { setConnectError(e.message); }
    setConnectLoading(false);
  };

  const handleDeposit = async () => {
    setDepositLoading(true);
    setDepositResult(null);
    try {
      const result = await depositCredits(depositAmount);
      setDepositResult(result);
      setDepositAmount('');
      // Refresh transactions
      const res = await fetch(`${API}/api/account/${wallet}/transactions`);
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch (e) {
      setDepositResult({ error: e.message });
    }
    setDepositLoading(false);
  };

  // ─── Sign-In Page ──────────────────────────────────────────────────────────
  if (!connected) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Sign In</h1>
          <p className="page-subtitle">Connect your Stellar wallet to access Forge402</p>
        </div>

        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(34,197,94,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>🛡️</span>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>SEP-10 Transaction Signing</h3>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div>1. Your wallet signs a challenge transaction (never submitted)</div>
              <div>2. Server verifies the signature</div>
              <div>3. Session token issued — <strong>your private key never leaves your wallet</strong></div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button
                onClick={() => setAuthMethod('wallet')}
                style={{
                  flex: 1, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                  background: authMethod === 'wallet' ? 'var(--accent-blue)' : 'var(--bg-primary)',
                  color: authMethod === 'wallet' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                🌐 Browser Wallet
              </button>
              <button
                onClick={() => setAuthMethod('secret')}
                style={{
                  flex: 1, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                  background: authMethod === 'secret' ? 'var(--accent-amber)' : 'var(--bg-primary)',
                  color: authMethod === 'secret' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                🔑 Secret Key
              </button>
            </div>

            {authMethod === 'wallet' && (
              <>
                <div style={{ textAlign: 'center', padding: '16px 0 24px' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🌐</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Connect Stellar Wallet</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 400, margin: '0 auto' }}>
                    Supports <strong>Freighter, xBull, Lobstr, Albedo</strong> and more via <strong>Stellar Wallets Kit</strong>.
                  </p>
                </div>

                {connectError && (
                  <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--accent-red)', marginBottom: 16 }}>{connectError}</div>
                )}

                <button className="btn btn-primary" onClick={handleWalletConnect} disabled={connectLoading} style={{ width: '100%', padding: '14px 20px', fontSize: 15 }}>
                  {connectLoading ? '⏳ Waiting for wallet...' : '🔐 Connect Wallet'}
                </button>

                <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-primary)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {['Freighter', 'xBull', 'Albedo', 'Lobstr', 'Hana', 'Hot Wallet', 'Rabet'].map(w => (
                      <span key={w} className="badge badge-blue" style={{ fontSize: 11 }}>{w}</span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {authMethod === 'secret' && (
              <>
                <div style={{ padding: '12px 16px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, marginBottom: 20, fontSize: 13, lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent-amber)', marginBottom: 4 }}>⚠️ Development / Testing Only</div>
                  <div style={{ color: 'var(--text-secondary)' }}>Used client-side to sign, then discarded. For production, use a browser wallet.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Secret Key</label>
                  <div style={{ position: 'relative' }}>
                    <input className="form-input" type={showSecret ? 'text' : 'password'} value={secretKey} onChange={e => setSecretKey(e.target.value)} placeholder="SXXX..." style={{ fontFamily: 'var(--font-mono)', fontSize: 13, paddingRight: 70 }} onKeyDown={e => e.key === 'Enter' && handleSecretKey()} autoComplete="off" />
                    <button onClick={() => setShowSecret(!showSecret)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                      {showSecret ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
                {connectError && (
                  <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--accent-red)', marginBottom: 16 }}>{connectError}</div>
                )}
                <button className="btn btn-primary" onClick={handleSecretKey} disabled={connectLoading || !secretKey.trim()} style={{ width: '100%' }}>
                  {connectLoading ? '⏳ Signing...' : '🔑 Sign In'}
                </button>
              </>
            )}
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🚀 New to Stellar?</h4>
            <ol style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2.2, paddingLeft: 20 }}>
              <li>Install <a href="https://freighter.app" target="_blank" rel="noopener">Freighter</a> browser extension</li>
              <li>Create a wallet → switch to <strong>Testnet</strong></li>
              <li>Fund via <a href="https://friendbot.stellar.org" target="_blank" rel="noopener">Friendbot</a> (testnet XLM)</li>
              <li>Get USDC from <a href="https://faucet.circle.com" target="_blank" rel="noopener">Circle Faucet</a> (select Stellar)</li>
              <li>Click &quot;Connect Wallet&quot; above</li>
            </ol>
          </div>
        </div>
      </>
    );
  }

  // ─── Connected Dashboard ───────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Wallet</h1>
        <p className="page-subtitle">Your Stellar wallet and Forge402 credits</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, padding: '10px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10 }}>
        <span className="pulse-dot green" />
        <span style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 600 }}>🔐 Authenticated via SEP-10</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-label">Forge402 Credits</div><div className="stat-value green">${account?.balance?.toFixed(2) ?? '0.00'}</div></div>
        <div className="stat-card"><div className="stat-label">On-Chain USDC</div><div className="stat-value blue">{onChain?.usdc ? Number(onChain.usdc).toFixed(2) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">On-Chain XLM</div><div className="stat-value purple">{onChain?.xlm ? Number(onChain.xlm).toFixed(2) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Total Deposited</div><div className="stat-value amber">${account?.total_deposited?.toFixed(2) ?? '0.00'}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🔗 Connected Wallet</h3>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 8, wordBreak: 'break-all', marginBottom: 12 }}>{wallet}</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href={`https://stellar.expert/explorer/testnet/account/${wallet}`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Stellar Explorer ↗</a>
          <button className="btn btn-danger btn-sm" onClick={disconnect}>Sign Out</button>
        </div>
      </div>

      {/* ─── Deposit Credits ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>💰 Deposit Credits</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
          Send USDC from your wallet to the platform. Your wallet will prompt you to approve the transaction.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 16 }}>$</span>
            <input
              className="form-input"
              type="number"
              step="0.01"
              min="0.01"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              placeholder="0.00"
              style={{ paddingLeft: 32, fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}
              disabled={depositLoading}
            />
          </div>
          <button className="btn btn-primary" onClick={handleDeposit} disabled={depositLoading || !depositAmount || parseFloat(depositAmount) <= 0} style={{ whiteSpace: 'nowrap', padding: '12px 24px' }}>
            {depositLoading ? '⏳ Signing...' : '💳 Deposit USDC'}
          </button>
        </div>

        {/* Quick amounts */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['1.00', '5.00', '10.00', '25.00'].map(amt => (
            <button key={amt} className="btn btn-secondary btn-sm" onClick={() => setDepositAmount(amt)} disabled={depositLoading} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              ${amt}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 8 }}>
          <strong>How it works:</strong> A USDC payment transaction is built → your wallet signs it → submitted to Stellar → credits added instantly.
          {onChain?.usdc && <span> Your on-chain balance: <strong>{Number(onChain.usdc).toFixed(2)} USDC</strong></span>}
        </div>

        {depositResult && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 8, background: depositResult.error ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)' }}>
            {depositResult.error ? (
              <div style={{ color: 'var(--accent-red)', fontSize: 13 }}>❌ {depositResult.error}</div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 2 }}>
                <div style={{ fontWeight: 700, color: 'var(--accent-green)', fontSize: 15, marginBottom: 4 }}>
                  ✅ ${depositResult.amount?.toFixed(2)} USDC deposited!
                </div>
                <div>New balance: <strong>${depositResult.balance?.toFixed(2)}</strong></div>
                {depositResult.txHash && (
                  <div>TX: <a href={`https://stellar.expert/explorer/testnet/tx/${depositResult.txHash}`} target="_blank" rel="noopener" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{depositResult.txHash.slice(0, 16)}... ↗</a></div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Transactions ────────────────────────────────────────────────── */}
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📋 Recent Transactions</h3>
        {transactions.length > 0 ? (
          <div className="table-container">
            <table>
              <thead><tr><th>Type</th><th>Amount</th><th>Asset</th><th>Direction</th><th>Time</th><th>TX</th></tr></thead>
              <tbody>
                {transactions.map((tx, i) => (
                  <tr key={i}>
                    <td><span className={`badge ${tx.type === 'received' ? 'badge-green' : 'badge-amber'}`}>{tx.type}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{Number(tx.amount).toFixed(4)}</td>
                    <td><span className="badge badge-blue">{tx.asset}</span></td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{tx.type === 'received' ? `from ${tx.from?.slice(0, 8)}...` : `to ${tx.to?.slice(0, 8)}...`}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(tx.created_at).toLocaleString()}</td>
                    <td><a href={tx.explorer_url} target="_blank" rel="noopener" style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{tx.tx_hash?.slice(0, 10)}... ↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No transactions yet.</p>
        )}
      </div>
    </>
  );
}
