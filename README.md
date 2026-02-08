# TrustTube

Auditable smart contracts, not agencies. Guaranteed payouts for creators, verified performance for brands.

TrustTube is a decentralized YouTube sponsorship escrow platform built on [Flare Network](https://flare.network). It replaces the trust-based middlemen of influencer marketing with transparent, auditable smart contracts. Brands deposit stablecoins into escrow, YouTube view counts are verified on-chain via Flare's Data Connector (FDC), and creators get paid automatically when milestones are hit.

## How It Works

1. **Brand creates a sponsorship order** -- defines milestones (e.g. 100K views = $500, 1M views = $5,000) or a linear pay-per-view rate, and specifies deadlines.
2. **Creator accepts and produces the video** -- picks up the order from the marketplace and uploads the sponsored content to YouTube.
3. **Brand reviews and funds the escrow** -- after reviewing the video, approves it. USDC is locked in the smart contract.
4. **Views are verified, payments released** -- the keeper service uses Flare's FDC to cryptographically prove YouTube view counts on-chain. Milestones unlock automatically as targets are hit. If the creator swaps or edits the video, tampering is detected via etag monitoring and remaining funds return to the brand.

## Project Structure

| Component | Path | Description |
|-----------|------|-------------|
| Smart Contracts | `contracts/trusttube/` | TrustTube escrow contract and MockUSDC test token (Solidity 0.8.25) |
| Keeper Service | `scripts/trusttube/keeper/` | Off-chain bot that fetches YouTube data, obtains FDC proofs, and updates view counts on-chain. Runs as CLI or HTTP server with SSE. |
| Frontend | `web/` | Next.js marketplace app for brands and creators (wagmi, RainbowKit, Tailwind, Supabase) |
| YouTube Proxy | `worker/` | Cloudflare Worker that proxies YouTube Data API v3 for FDC verifiers |
| Deployment | `scripts/trusttube/deploy.ts` | Hardhat deploy script, saves addresses to `deployments/` |
| Database | `supabase/migrations/` | PostgreSQL schema for deal applications and YouTube OAuth tokens |

## Smart Contracts

Deployed to Coston2 (Flare testnet, Chain ID 114).

**TrustTube** is the main contract. It manages the full deal lifecycle: brands create orders with milestone or linear payment terms, creators accept and submit YouTube videos, brands approve and deposit USDC into escrow, a keeper updates FDC-verified view counts, and creators claim payouts as targets are reached. The contract also handles tamper detection (if a video's etag changes, the deal terminates and remaining funds return to the brand) and deadline-based fund reclamation for missed milestones.

**MockUSDC** is a standard ERC20 (6 decimals) used as the payment token during testing.

### Deal Lifecycle

```
Open --> InProgress --> InReview --> Active --> Completed
                                       |
                                       +--> Terminated (tampering)
```

### Payment Modes

- **Milestone** -- discrete payouts at specific view count targets, each with its own deadline. E.g. $500 at 100K views, $5,000 at 1M views.
- **Linear** -- continuous pay-per-view up to a total cap. E.g. $0.005/view up to $10,000.

## Flare Data Connector (FDC) Integration

The FDC is the core trust mechanism. Instead of relying on an oracle operator, TrustTube uses Flare's decentralized attestation protocol to cryptographically prove YouTube data on-chain.

The pipeline works as follows: the keeper builds a `Web2Json` attestation request pointing to our Cloudflare Worker (which proxies the YouTube API), submits it to the FDC Hub, where a network of independent verifiers each query the URL and vote on the response. After consensus, the keeper retrieves a Merkle proof from the DA Layer and calls `updateViews()` on the contract. The contract verifies the proof via `ContractRegistry.getFdcVerification().verifyWeb2Json()`, decodes the ABI-encoded response, validates the video ID, and updates the on-chain view count.

Two types of proofs are used:

- **View Count** -- proves the current view count (`ViewCountDTO{videoId, viewCount}`). Drives milestone and linear payouts.
- **Etag** -- proves the current video etag (`EtagDTO{videoId, etag}`). If it differs from the stored hash, the video was tampered with and the deal terminates.

## Keeper Service

The keeper is the off-chain bot that bridges YouTube data to the smart contract via FDC. It polls active deals every 5 minutes, checks if view counts increased, and if so runs the full FDC attestation pipeline (prepare request, submit to hub, wait for round finalization, retrieve proof, call contract). Every ~30 minutes it also checks etags for tampering.

Two modes are available:
- **CLI** (`keeper/index.ts`) -- auto-polls in a loop, logs to console.
- **HTTP Server** (`keeper/server.ts`) -- exposes a REST API and SSE stream for the frontend keeper dashboard. Supports manual triggers, config changes, and real-time monitoring.

## Frontend Marketplace

A Next.js web app serving as the marketplace for both brands and creators.

- **Marketplace** -- browse all open sponsorship orders with status, payment mode, and budget.
- **Order Creation** -- brands configure milestone targets or linear rates, set deadlines, and submit on-chain.
- **Order Detail** -- the full lifecycle UI: creators apply, submit videos (with YouTube OAuth upload), and claim payouts. Brands review applications, accept creators, approve videos, and monitor progress.
- **Dashboard** -- personal view of the user's active deals and payment progress.
- **Keeper Dashboard** -- real-time monitoring of FDC checks with step-by-step progress indicators, transaction links, and configuration controls. Connects to the keeper server via SSE.

Off-chain data (deal applications, YouTube OAuth tokens) is stored in Supabase PostgreSQL.

## Deployment

```bash
# Deploy contracts to Coston2
yarn hardhat run scripts/trusttube/deploy.ts --network coston2

# Run keeper (CLI or HTTP server)
yarn hardhat run scripts/trusttube/keeper/index.ts --network coston2
yarn hardhat run scripts/trusttube/keeper/server.ts --network coston2

# Run frontend
cd web && yarn install && yarn dev

# Deploy YouTube proxy worker
cd worker && npx wrangler secret put YOUTUBE_API_KEY && npx wrangler deploy
```

See `.env.example` for required environment variables (contract addresses, FDC endpoints, Supabase keys, Google OAuth client ID, etc.).

## Network

TrustTube is deployed on **Coston2** (Flare testnet, Chain ID 114). The hardhat config also supports Coston, Songbird, and Flare mainnet.
