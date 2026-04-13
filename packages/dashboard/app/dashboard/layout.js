'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WalletProvider, { useWallet } from '../components/WalletProvider';

const navLinks = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/agents', label: 'Agents', icon: '🤖' },
  { href: '/dashboard/tools', label: 'Marketplace', icon: '🔧' },
  { href: '/dashboard/wallet', label: 'Wallet', icon: '💳' },
  { href: '/dashboard/docs', label: 'Docs', icon: '📚' },
  { href: '/dashboard/admin', label: 'Admin', icon: '🔑' },
];

function Sidebar() {
  const pathname = usePathname();
  const { wallet, balance, connected, disconnect } = useWallet();

  return (
    <aside className="sidebar">
      <Link href="/" style={{ textDecoration: 'none' }}>
        <div className="sidebar-logo">
          <span style={{ fontSize: 18 }}>⚡</span>
          <span>Forge402</span>
        </div>
      </Link>
      <div className="sidebar-subtitle">Agent Marketplace</div>

      {/* Wallet */}
      <div className="wallet-badge" style={{ marginBottom: 20 }}>
        {connected ? (
          <>
            <div className="wallet-badge-label">
              <span className="pulse-dot green" style={{ width: 5, height: 5, marginRight: 6 }} />
              Connected
            </div>
            <div className="wallet-badge-address">{wallet.slice(0, 8)}…{wallet.slice(-6)}</div>
            <div className="wallet-badge-balance">${balance.toFixed(2)} USDC</div>
            <button onClick={disconnect} className="btn btn-sm btn-secondary" style={{ width: '100%', marginTop: 8, fontSize: 11 }}>
              Disconnect
            </button>
          </>
        ) : (
          <Link href="/dashboard/wallet" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="wallet-badge-label">Not Connected</div>
            <div style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>Connect Wallet →</div>
          </Link>
        )}
      </div>

      <nav className="sidebar-nav">
        {navLinks.map(link => (
          <Link key={link.href} href={link.href}
            className={`sidebar-link ${pathname === link.href ? 'active' : ''}`}>
            <span className="sidebar-link-icon">{link.icon}</span>
            {link.label}
          </Link>
        ))}
        <a href="https://github.com/AswinWebDev/Forge402" target="_blank" rel="noopener noreferrer" className="sidebar-link" style={{ marginTop: 'auto' }}>
          <span className="sidebar-link-icon">⭐</span>
          GitHub
        </a>
      </nav>

      <div className="sidebar-footer">
        <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="pulse-dot green" style={{ width: 4, height: 4 }} />
          Stellar Testnet · x402 · A2A
        </div>
      </div>
    </aside>
  );
}

function DashboardContent({ children }) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}

export default function DashboardLayout({ children }) {
  return (
    <WalletProvider>
      <DashboardContent>{children}</DashboardContent>
    </WalletProvider>
  );
}
