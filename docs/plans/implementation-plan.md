# TrustTube — Implementation Plan

## Context

Building a decentralized YouTube sponsorship marketplace for ETHOxford26 hackathon. Clients post video orders with milestone-based or linear payments. Creators apply, make videos, and get paid trustlessly as view count milestones are verified on-chain via Flare's FDC protocol. This eliminates the need for a trusted escrow service.

Full design: `docs/plans/2026-02-07-trusttube-design.md`

## Key Technical Decisions

1. **Web2Json, not JsonApi** — Flare's starter kit marks `JsonApi` as deprecated. Use `Web2Json` attestation type with `IWeb2Json.Proof` and `ContractRegistry.getFdcVerification().verifyWeb2Json(proof)`. Source ID: `"PublicWeb2"`.
2. **No YouTube upload for MVP** — creators paste their YouTube video ID instead of uploading through the platform. Saves enormous complexity while preserving the core value prop.
3. **Etag stored as bytes32** — `keccak256(bytes(etag))` for gas-efficient on-chain comparison.
4. **Mock ERC20** — no native stablecoins on Coston2, deploy our own `MockUSDC`.

## Architecture

```
ETHOxford26/
  contracts/           # Hardhat (cloned from flare-hardhat-starter)
    contracts/
      MockUSDC.sol
      TrustTube.sol
    scripts/deploy.ts
    test/TrustTube.test.ts
  web/                 # Next.js 14 (App Router)
    src/
      app/             # Pages: /, /marketplace, /order/[id], /create-order, /dashboard, /profile/[address], /auth
      components/      # Shared UI components
      config/          # Contract addresses, ABIs, chain config
      lib/             # Supabase client, utils
    api/               # API routes: auth, orders, applications, youtube, fdc
  scripts/keeper/      # Keeper bot (Node.js)
```

---

## Phase 0: Project Scaffolding

### Step 0.1 — Initialize monorepo structure

- Create directory structure
- Init git repo

### Step 0.2 — Set up Hardhat project

- Clone `flare-hardhat-starter` as `contracts/`
- Already includes `@flarenetwork/flare-periphery-contracts`, `@openzeppelin/contracts`, Coston2 config
- Set up `.env` with `PRIVATE_KEY`, `VERIFIER_URL_TESTNET`, `VERIFIER_API_KEY_TESTNET`, `COSTON2_DA_LAYER_URL`, `YOUTUBE_API_KEY`

### Step 0.3 — Set up Next.js app

- `npx create-next-app@latest web --typescript --tailwind --app --src-dir`
- Install: `wagmi`, `viem`, `@rainbow-me/rainbowkit`, `@supabase/supabase-js`, `@tanstack/react-query`, `ethers`

### Step 0.4 — Set up Supabase

- Create project, get `SUPABASE_URL` and `SUPABASE_ANON_KEY`

**Verify**: `npx hardhat compile` and `npm run dev` both work.

---

## Phase 1: Smart Contracts

### Step 1.1 — MockUSDC.sol

- ERC20 with 6 decimals, public `mint()` function for testnet

### Step 1.2 — TrustTube.sol — Data Structures

- Enums: `DealStatus` (Open, InProgress, InReview, Active, Completed, Terminated), `PaymentMode` (Milestone, Linear)
- Structs: `MilestoneConfig` (viewTarget, payoutAmount, deadlineTimestamp, isPaid), `LinearConfig` (ratePerView, totalCap, lastClaimedViews), `Deal` (id, client, creator, stablecoin, paymentMode, status, youtubeVideoId, etag as bytes32, videoDeadline, totalDeposited, totalPaid)
- Mappings: `deals`, `milestones`, `linearConfigs`

### Step 1.3 — TrustTube.sol — Deal Lifecycle

- `createOrder(...)` — stores deal as Open, milestones/linear config
- `acceptCreator(dealId, creatorAddress)` — client only, Open → InProgress
- `submitVideo(dealId, videoId, etagHash)` — creator only, InProgress → InReview
- `approveVideo(dealId)` — client only, InReview → Active, transfers stablecoins via `transferFrom` into contract, sets milestone deadlines
- `claimExpired(dealId, milestoneIndex)` — client reclaims expired milestone funds

### Step 1.4 — TrustTube.sol — FDC Proof Verification

- Import `ContractRegistry` and `IWeb2Json` from `@flarenetwork/flare-periphery-contracts/coston2/`
- `_verifyProof()` — calls `ContractRegistry.getFdcVerification().verifyWeb2Json(proof)`
- `claimMilestone(dealId, milestoneIndex, proof)` — verify proof, decode viewCount, check >= target, transfer payout
- `claimLinear(dealId, proof)` — verify proof, calculate accrued payment, transfer
- `reportTampering(dealId, proof)` — verify proof, compare etag hash, if different → Terminated, return funds

### Step 1.5 — Deploy to Coston2

- Deploy MockUSDC, then TrustTube
- Save addresses to `contracts/deployments/coston2.json`

### Step 1.6 — Basic contract tests

**Verify**: `npx hardhat test` passes, contracts deployed on Coston2.

---

## Phase 2: Supabase Schema

### Step 2.1 — Create tables

- `users` (wallet_address, google_id, google_email, google_access_token, google_refresh_token, role)
- `creator_profiles` (user_id, youtube_channel_id, channel_name, subscriber_count, bio, avatar_url, rating)
- `orders` (user_id, title, description, documentation, payment_mode, linear_rate, linear_cap, stablecoin_address, video_deadline_days, status, contract_deal_id)
- `milestones` (order_id, milestone_index, view_target, payout_amount, deadline_days, is_paid)
- `applications` (order_id, creator_user_id, message, status)
- `cases` (order_id, creator_user_id, youtube_video_id, etag, video_status, contract_deal_id, current_views)
- `reviews` (case_id, reviewer_user_id, rating, comment)

### Step 2.2 — Enable RLS and realtime on `cases`

**Verify**: Test queries via Supabase dashboard.

---

## Phase 3: Frontend Core

### Step 3.1 — Providers + wallet connection

- Configure wagmi with Coston2 chain (chain ID 114, RPC `https://coston2-api.flare.network/ext/C/rpc`)
- RainbowKit for wallet UI

### Step 3.2 — Contract config

- Export addresses and ABIs from compilation artifacts

### Step 3.3 — Supabase client

- `createClient()` with env vars

### Step 3.4 — Auth flow

- Wallet connect via RainbowKit
- Google OAuth via Next.js API routes (scopes: `youtube.readonly`)
- Link wallet + Google in `users` table

### Step 3.5 — Landing page

**Verify**: Connect wallet on localhost, Coston2 network.

---

## Phase 4: Create & Browse Orders

### Step 4.1 — Create Order page

- Dynamic form for milestones (add/remove rows) or linear config
- On submit: call `TrustTube.createOrder()` on-chain → save to Supabase with `contract_deal_id`

### Step 4.2 — Marketplace page

- Query Supabase for open orders, display cards

### Step 4.3 — Order Detail page

- Full order info, milestones/linear config
- Creator: "Apply" button
- Client: list applications, accept/reject

### Step 4.4 — Application API routes

- POST/PATCH for applications
- On accept: call `TrustTube.acceptCreator()` on-chain

**Verify**: Create order from wallet A, apply from wallet B, accept.

---

## Phase 5: Video Submission & Approval

### Step 5.1 — Submit Video (creator)

- Creator pastes YouTube video ID
- API route fetches etag via YouTube Data API
- Call `TrustTube.submitVideo(dealId, videoId, keccak256(etag))` on-chain
- Update Supabase case

### Step 5.2 — Approve Video (client)

- Client reviews video via YouTube link
- "Approve" button: `MockUSDC.approve()` then `TrustTube.approveVideo()` on-chain
- Status → Active

**Verify**: Full flow from video submission to fund deposit.

---

## Phase 6: FDC Integration & Payouts

### Step 6.1 — FDC utility module (`scripts/keeper/fdc-utils.ts`)

- `prepareViewCountAttestation(videoId)` — builds Web2Json request for YouTube stats API with JQ transform `.items[0] | {videoId: .id, viewCount: (.statistics.viewCount | tonumber)}`
- `prepareEtagAttestation(videoId)` — similar, extracts etag
- `submitAttestation()` — submits to FdcHub
- `retrieveProof()` — polls DA Layer for Merkle proof

### Step 6.2 — Keeper bot (`scripts/keeper/index.ts`)

- Polls active cases every 5 minutes
- Checks YouTube view counts off-chain first
- If milestone threshold met: prepare attestation → submit → retrieve proof → call `claimMilestone()`
- Periodically check etag for tampering

### Step 6.3 — Manual claim API route (fallback)

- `POST /api/fdc/claim` — triggers FDC flow server-side, returns proof for frontend to submit

**Verify**: Run FDC pipeline end-to-end with a real YouTube video, verify on-chain payout.

---

## Phase 7: Dashboard & Profiles

### Step 7.1 — Dashboard

- Client view: active orders, case progress, milestone tracker, claim expired
- Creator view: active cases, earnings, milestone progress, claim buttons
- Supabase realtime for live updates

### Step 7.2 — Profile page

- YouTube channel info, rating, reviews, past deals

**Verify**: Navigate all dashboard states.

---

## Phase 8: Polish

### Step 8.1 — Error handling, loading states, toasts

### Step 8.2 — Contract event sync (poll `eth_getLogs`, update Supabase)

### Step 8.3 — Demo preparation with scripted flow

---

## Priority for Hackathon

| Priority | What                                  |
| -------- | ------------------------------------- |
| P0       | Phase 0 (scaffolding)                 |
| P0       | Phase 1 (contracts)                   |
| P0       | Phase 2 (database)                    |
| P0       | Phase 3 (frontend core + auth)        |
| P1       | Phase 4 (orders + marketplace)        |
| P1       | Phase 5 (video submission + approval) |
| P1       | Phase 6 (FDC integration)             |
| P2       | Phase 7 (dashboard + profiles)        |
| P3       | Phase 8 (polish)                      |

## Verification Plan

1. Deploy contracts to Coston2, verify on explorer
2. Create order → apply → accept → submit video → approve → funds deposited (full lifecycle)
3. FDC attestation for YouTube view count → Merkle proof verified on-chain → milestone paid
4. Etag change detection → tampering reported → funds returned
5. Expired milestone → client reclaims funds

## Network Details

- **Chain ID**: 114
- **RPC**: `https://coston2-api.flare.network/ext/C/rpc`
- **Explorer**: `https://coston2-explorer.flare.network`
- **Faucet**: `https://faucet.flare.network/`
- **FdcHub**: `0xCf6798810Bc8C0B803121405Fee2A5a9cc0CA5E5`
- **Relay**: `0x32D46A1260BB2D8C9d5Ab1C9bBd7FF7D7CfaabCC`
- **FlareContractRegistry**: `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
