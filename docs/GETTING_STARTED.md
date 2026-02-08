# TrustTube — Getting Started

## Prerequisites

- Node.js 18+
- Yarn (`corepack enable && corepack prepare yarn@1 --activate`)
- MetaMask or another wallet with a Coston2 account

## 1. Install Dependencies

```bash
# Root (smart contracts, keeper bot)
yarn install

# Frontend
cd web && npm install && cd ..
```

## 2. Environment Setup

### Root `.env`

Copy the example and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
# Your wallet private key (with C2FLR for gas)
PRIVATE_KEY="0xYOUR_PRIVATE_KEY"

# YouTube Data API v3 key (for keeper bot)
YOUTUBE_API_KEY="your_youtube_api_key"

# Deployed TrustTube address (set after deploy)
TRUSTTUBE_ADDRESS="0x..."

# These defaults work for testnet — no changes needed
VERIFIER_URL_TESTNET=https://fdc-verifiers-testnet.flare.network
VERIFIER_API_KEY_TESTNET=00000000-0000-0000-0000-000000000000
COSTON2_DA_LAYER_URL=https://ctn2-data-availability.flare.network
```

### Frontend `web/.env.local`

Create this file after deploying contracts:

```env
NEXT_PUBLIC_TRUSTTUBE_ADDRESS=0x...
NEXT_PUBLIC_MOCK_USDC_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_ID=demo
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## 3. Get Testnet Tokens

Get C2FLR from the [Coston2 Faucet](https://faucet.flare.network/coston2).

## 4. Compile & Test Contracts

```bash
yarn hardhat compile
yarn hardhat test test/TrustTube.test.ts
```

All 13 tests should pass.

## 5. Deploy Contracts

```bash
yarn hardhat run scripts/trusttube/deploy.ts --network coston2
```

Output will show:

```
MockUSDC deployed to: 0x...
TrustTube deployed to: 0x...
Deployment addresses saved to deployments/coston2.json
```

Copy the addresses into:

- `web/.env.local` (the `NEXT_PUBLIC_` vars)
- `.env` (the `TRUSTTUBE_ADDRESS` var)

**Important:** `NEXT_PUBLIC_TRUSTTUBE_ADDRESS` = the TrustTube address, `NEXT_PUBLIC_MOCK_USDC_ADDRESS` = the MockUSDC address. Don't swap them.

## 6. Start the Frontend

```bash
cd web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Using the Frontend

1. **Connect wallet** — click the connect button, switch to Coston2 network
2. **Mint test USDC** — call `mint` on the MockUSDC contract via the explorer to get test tokens
3. **Create Order** — go to Create Order, set milestones or linear payment, submit
4. **Accept Creator** — on the order detail page, enter a creator wallet address
5. **Submit Video** — as the creator, enter a YouTube video ID and its etag
6. **Approve Video** — as the client, approve the video (deposits USDC into escrow)

## 7. Start the Keeper Bot

```bash
yarn hardhat run scripts/trusttube/keeper/index.ts --network coston2
```

The keeper bot:

- Polls every 5 minutes for active deals
- Checks YouTube view counts off-chain
- When a milestone target is reached, submits an FDC attestation to claim the payout
- Every 30 minutes, checks video etags for tampering

## 8. Supabase (Optional)

If you want the full database layer:

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in the SQL editor: `supabase/migrations/001_initial_schema.sql`
3. Copy the project URL and anon key into `web/.env.local`

## Where to Get API Keys

| Key                      | Source                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| C2FLR testnet tokens     | [Coston2 Faucet](https://faucet.flare.network/coston2)                                                                     |
| YouTube Data API v3      | [Google Cloud Console](https://console.cloud.google.com) — enable YouTube Data API v3, create API key, set to unrestricted |
| WalletConnect Project ID | [WalletConnect Cloud](https://cloud.walletconnect.com) — free                                                              |
| Supabase URL + Anon Key  | [Supabase](https://supabase.com) — Settings > API                                                                          |

## Project Structure

```
contracts/trusttube/
  TrustTube.sol          — Main escrow contract
  MockUSDC.sol           — Test ERC20 (6 decimals)

scripts/trusttube/
  deploy.ts              — Deploy to Coston2
  keeper/
    index.ts             — FDC keeper bot (polling loop)
    fdc-utils.ts         — YouTube attestation helpers

test/
  TrustTube.test.ts      — 13 unit tests

web/src/
  app/
    page.tsx             — Landing page
    marketplace/         — Browse open orders
    create-order/        — Create sponsorship order
    order/[id]/          — Order detail + actions
    dashboard/           — Client/Creator dashboard
  components/
    Providers.tsx         — Wagmi + RainbowKit + React Query
    Navbar.tsx            — Navigation bar
  config/
    chain.ts             — Coston2 chain definition
    contracts.ts         — ABIs and addresses
    wagmi.ts             — Wagmi config

supabase/migrations/
  001_initial_schema.sql — 7 tables with RLS

deployments/
  coston2.json           — Deployed contract addresses
```
