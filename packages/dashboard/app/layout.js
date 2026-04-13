import './globals.css';

export const metadata = {
  title: 'Forge402 — Autonomous x402 Agent Marketplace',
  description: 'The decentralized marketplace where AI agents deploy sub-agents, discover tools, and pay via x402 micropayments on Stellar.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
