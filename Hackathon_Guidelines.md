im participating for a hackathon that is Stellar hacks,
Agents on Stellar
Agents are one of the biggest stories in tech right now, but most agents still run into the same hard stop: payments. They can reason, plan, and act — right up until they need to pay for an API call, unlock a tool, access premium data, or complete a paid task. That’s what makes this moment so interesting on Stellar. With x402 on Stellar, builders can turn ordinary HTTP requests into paid interactions using stablecoin micropayments and Soroban authorization, letting apps, services, and agents transact natively on the web.
This hackathon is about exploring what happens when agents don’t just talk — they can buy, sell, coordinate, and earn. Think agent-to-agent services, paid tools, autonomous research workflows, machine-run marketplaces, onchain paywalls, or APIs that monetize every useful call instead of hiding behind subscriptions and API keys. Machine Payments Protocol (MPP) is also pushing this frontier forward with machine-to-machine payment flows built for paid resources, microtransactions, and programmable access, and Stellar builders can also explore the experimental `stellar-mpp-sdk` for MPP-style flows on Stellar.
Stellar is a particularly strong place to build for this shift. It gives developers fast settlement, very low transaction costs, strong stablecoin infrastructure, and programmable guardrails through contract accounts and spending policies. In other words: the rails are finally here for software that can act economically, not just conversationally. The opportunity in this hackathon is to build the kinds of products that feel obvious in hindsight — apps, agents, and services that make the internet more programmable, more open, and more native to payments.
, and in the youtube video it says "Agentic AI is reshaping the world, and there is a growing machine economy where agents are autonomously paying for services using digital assets. From March 30th to April 13th, we're running the Stellar Hacks Agentic AI Hackathon right here on Dorahacks. There's $10,000 in XLM up for grabs, with 5,000 going to first place. The requirements are simple. Build something on Stellar, make it open source, and send us a demo video with your submission. We're quickly moving from AI that generates responses to AI agents that
can act, discover services, pay for them, complete tasks end-to-end without human assistance. And the unlock for this is something called X402. This just gone live on the Stellar network. Back in 1997, the HTTP spec reserved status code 402 for a future where websites could charge for access directly. For nearly 30 years, the internet has been waiting for a native payment layer. X402 allows APIs and websites to request payment directly through the HTTP protocol using the 402 payment required status code.
Combined with fast, low-cost transactions on the Stellar network, this enables true micropayments, enables agents to pay for things without credit cards, subscriptions, or barriers. Let me show you what that actually looks like. This morning, I checked the weather. Pretty standard, not that exciting, especially in the UK. But what happened in the background is an AI agent requested weather data from a paid API. It hit a paywall. Instead of failing, it made a micro-payment using X402, retrieved the data, then called
another X402 service to turn that into an image, and delivered the result. No API keys, no subscriptions, no human intervention. Developers can set up and sell paid services using common middleware like Express for Node.js. You can instruct an agent like Claude Code to make payments using an MCP server. The payment is verified on chain, and the service returns data instantly. From the agent's perspective, it just solved the task without signing up or having to seek assistance. You can just give it
some pocket money and let it run wild. And from the developer's perspective, you've just created a service that can be discovered and paid for programmatically. That changes everything, because right now almost every API on the internet is built for humans. API keys, subscriptions, dashboards, all based on the assumption that the buyer is a person. But APIs aren't for people. They're designed for software. But agents don't work like that. They need usage-based, real-time access to
services. [music] They need to be able to discover, pay, and continue quickly and efficiently. And that's what X402 enables. We're going to be building in the first wave of products and services for this new model. If you're a developer, this is a great opportunity to experiment with something genuinely new and work at the cutting edge of an emerging technology. So, put your agents to work, and build something amazing using Agentic AI and the Stellar network.
"
Resources
We have a lot of resources to help you during this hackathon. __Visit the Resources tab.__
Submission Requirements
1. Open-source repo A public GitHub or GitLab repository containing the full source code and a clear `README.md` explaining the project. The more detail you include, the better. Didn’t finish a feature? Used mock data in places? Document it in the README.
2. Video demo A 2–3 minute video walkthrough of your project. It doesn’t need to be overly technical, but it should clearly show what you built and explain the work you did.
3. Stellar testnet/mainnet interaction Your project must submit, consume, or otherwise integrate real Stellar testnet or mainnet transactions.
Inspiration & Ideas
Need a spark? Check out the __Ideas & Inspiration__ tab.
$10,000 Prize Pool
This hackathon features a single open innovation track with awards for the top projects:
* First Place: $5,000 in XLM
* Second Place: $2,000 in XLM
* Third Place: $1,250 in XLM
* Fourth Place: $1,000 in XLM
* Fifth Place: $750 in XLM
Key Dates
* Submissions Open: March 30, 2026
* Submission deadline: April 13, 2026
Hackathon Support
The team is here to help you every step of the way. Feel free to drop in any of the following channels for assistance:
* __Stellar Hacks Telegram Group__
* __Stellar Dev Discord__
Note: Please beware of scams via DM on both platforms.
Ideas & Inspiration
The following are some ideas to get your mind thinking. This is an open innovation hackathon so you are free to pick your own idea and run with it.
Private x402 payments
* Privacy pool for x402 payments with pre-funding, operator-managed settlement, and batched facilitator withdrawals for efficiency.
Paid agent services / APIs
Pay-per-token AI inferencePay-per-query searchFinancial market dataTrading signalsSecurity vulnerability scanningWeb scraping / data collectionReal-time news feedsPay-per-article news accessBlockchain indexingPay-per-second computeIoT automationPay-per-move online games
Agent wallets, coordination, and commerce
Agent wallet integrationsAgent-to-agent communication and paymentsAgent marketplaces / service discoveryRating, reputation, and trust systems
Infrastructure / ecosystem tooling
Bazaar-style discoverability for x402 servicesBazaar-enabled Stellar facilitatorMainnet-ready facilitator infrastructure for service listing and discovery
Security and controls
Prompt injection defensesSandboxed executionOther safety features for autonomous agents
Onchain finance and governance
DeFi integrationsAI fund managersDAO / governance experiments
Concrete demand signals / real user pain points
Pay-per-query web search instead of monthly subscriptionsExample: search access for agent workflows like OpenClaw using a service such as Brave Search on a usage basis.
////
