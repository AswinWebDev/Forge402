'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const WalletContext = createContext(null);

export function useWallet() {
  return useContext(WalletContext);
}

export default function WalletProvider({ children }) {
  const [wallet, setWallet] = useState(null);
  const [account, setAccount] = useState(null);
  const [onChain, setOnChain] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const kitRef = useRef(null);

  // Restore session on mount — validate that the token is still valid
  useEffect(() => {
    const saved = localStorage.getItem('agenthub_wallet');
    const savedToken = localStorage.getItem('agenthub_session');
    if (saved && savedToken) {
      // Quick client-side expiry check
      try {
        const decoded = JSON.parse(atob(savedToken));
        const payload = JSON.parse(decoded.data);
        if (payload.expires_at < Date.now()) {
          // Token expired — clear and force re-auth
          localStorage.removeItem('agenthub_wallet');
          localStorage.removeItem('agenthub_session');
          setLoading(false);
          return;
        }
      } catch {
        // Invalid token format — clear
        localStorage.removeItem('agenthub_wallet');
        localStorage.removeItem('agenthub_session');
        setLoading(false);
        return;
      }
      setWallet(saved);
      setSessionToken(savedToken);
    }
    setLoading(false);
  }, []);

  // Refresh account data
  const refreshAccount = useCallback(async () => {
    if (!wallet) { setAccount(null); setOnChain(null); return; }
    try {
      const res = await fetch(`${API}/api/account/${wallet}`);
      if (res.ok) {
        const data = await res.json();
        setAccount(data.account);
        setOnChain(data.on_chain);
      }
    } catch {}
  }, [wallet]);

  useEffect(() => {
    refreshAccount();
    if (!wallet) return;
    const interval = setInterval(refreshAccount, 10000);
    return () => clearInterval(interval);
  }, [wallet, refreshAccount]);

  /**
   * Initialize Stellar Wallets Kit (lazy — only on first connect attempt)
   */
  const getKit = async () => {
    if (kitRef.current) return kitRef.current;
    const { StellarWalletsKit } = await import('@creit-tech/stellar-wallets-kit/sdk');
    const { defaultModules } = await import('@creit-tech/stellar-wallets-kit/modules/utils');
    // init() configures the singleton — methods are on the class itself
    StellarWalletsKit.init({ modules: defaultModules() });
    kitRef.current = StellarWalletsKit;
    return StellarWalletsKit;
  };

  /**
   * SEP-10 challenge-response auth using a signed transaction.
   * Works with any Stellar wallet (Freighter, xBull, Lobstr, etc.)
   */
  const authenticateWithTransaction = async (publicKey, signXdrFn) => {
    // Step 1: Get challenge transaction XDR from server
    const challengeRes = await fetch(`${API}/api/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: publicKey }),
    });
    if (!challengeRes.ok) {
      const err = await challengeRes.json();
      throw new Error(err.error || 'Failed to get challenge');
    }
    const { challengeXDR, networkPassphrase } = await challengeRes.json();

    // Step 2: Sign the XDR with wallet
    const signedXDR = await signXdrFn(challengeXDR, networkPassphrase, publicKey);

    // Step 3: Verify → session token
    const verifyRes = await fetch(`${API}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: publicKey, signedXDR }),
    });
    if (!verifyRes.ok) {
      const err = await verifyRes.json();
      throw new Error(err.error || 'Verification failed');
    }
    const session = await verifyRes.json();

    // Persist session
    setWallet(publicKey);
    setSessionToken(session.token);
    setAccount(session.account);
    localStorage.setItem('agenthub_wallet', publicKey);
    localStorage.setItem('agenthub_session', session.token);
    return session;
  };

  /**
   * Connect via Stellar Wallets Kit (supports Freighter + 10 other wallets)
   */
  const connectWallet = async () => {
    const Kit = await getKit();

    // authModal() opens the wallet picker → user selects wallet → returns address
    const { address } = await Kit.authModal();
    if (!address || !address.startsWith('G')) {
      throw new Error('No address received from wallet');
    }

    return authenticateWithTransaction(address, async (challengeXDR, networkPassphrase, addr) => {
      // signTransaction signs a Stellar transaction XDR
      const { signedTxXdr } = await Kit.signTransaction(challengeXDR, {
        networkPassphrase,
        address: addr,
      });
      return signedTxXdr;
    });
  };

  /**
   * Dev-only: Connect via secret key (testing without browser extension)
   */
  const connectSecretKey = async (secretKey) => {
    const { Keypair, TransactionBuilder, Networks } = await import('@stellar/stellar-sdk');
    let keypair;
    try { keypair = Keypair.fromSecret(secretKey); }
    catch { throw new Error('Invalid secret key.'); }

    const publicKey = keypair.publicKey();

    return authenticateWithTransaction(publicKey, async (challengeXDR) => {
      const tx = TransactionBuilder.fromXDR(challengeXDR, Networks.TESTNET);
      tx.sign(keypair);
      return tx.toEnvelope().toXDR('base64');
    });
  };

  const disconnect = () => {
    setWallet(null); setAccount(null); setOnChain(null); setSessionToken(null);
    localStorage.removeItem('agenthub_wallet');
    localStorage.removeItem('agenthub_session');
  };

  /**
   * Deposit USDC credits:
   * 1. Build a USDC payment TX (user → platform wallet)
   * 2. Sign via Stellar Wallets Kit (Freighter popup)
   * 3. Submit to Stellar Horizon
   * 4. Backend verifies on-chain and credits account
   */
  const depositCredits = async (amountStr) => {
    if (!wallet) throw new Error('Connect wallet first');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) throw new Error('Enter a valid amount');

    const {
      TransactionBuilder, Networks, Operation, Asset, Horizon,
    } = await import('@stellar/stellar-sdk');

    const Kit = await getKit();

    // Fetch platform wallet from server stats
    const statsRes = await fetch(`${API}/api/stats`);
    const stats = await statsRes.json();
    const platformWallet = stats.platform_wallet;
    if (!platformWallet) throw new Error('Platform wallet not configured');

    // Load sender account from Horizon for sequence number
    const server = new Horizon.Server('https://horizon-testnet.stellar.org');
    const senderAccount = await server.loadAccount(wallet);

    // USDC testnet asset
    const usdc = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');

    // Build the payment transaction
    const tx = new TransactionBuilder(senderAccount, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({
        destination: platformWallet,
        asset: usdc,
        amount: amount.toFixed(7), // Stellar uses 7 decimal places
      }))
      .setTimeout(300)
      .build();

    // Sign via Wallets Kit (Freighter popup)
    const { signedTxXdr } = await Kit.signTransaction(tx.toXDR(), {
      networkPassphrase: Networks.TESTNET,
      address: wallet,
    });

    // Submit to Stellar network
    const submitRes = await server.submitTransaction(
      TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
    );

    const txHash = submitRes.hash;

    // Credit on backend (verifies the TX on-chain)
    const creditRes = await fetch(`${API}/api/auth/credit-tx`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ txHash }),
    });
    const creditData = await creditRes.json();
    if (!creditRes.ok) throw new Error(creditData.error || 'Credit failed');

    await refreshAccount();
    return { ...creditData, txHash };
  };

  const getHeaders = () => {
    const h = { 'Content-Type': 'application/json' };
    if (sessionToken) h['X-Session-Token'] = sessionToken;
    if (wallet) h['X-Wallet'] = wallet;
    return h;
  };

  const apiFetch = async (path, options = {}) => {
    const url = path.startsWith('http') ? path : `${API}${path}`;
    const sep = url.includes('?') ? '&' : '?';
    const walletUrl = wallet ? `${url}${sep}wallet=${wallet}` : url;
    return fetch(walletUrl, { ...options, headers: { ...getHeaders(), ...options.headers } });
  };

  return (
    <WalletContext.Provider value={{
      wallet, account, onChain, sessionToken, loading,
      connected: !!wallet, authenticated: !!sessionToken,
      balance: account?.balance || 0,
      connectWallet, connectSecretKey, disconnect,
      depositCredits, refreshAccount, getHeaders, apiFetch, API,
    }}>
      {children}
    </WalletContext.Provider>
  );
}
