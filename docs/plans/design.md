# TrustTube — Design Document

## Overview

TrustTube is a decentralized marketplace connecting YouTube creators with clients who want native video integrations, with trustless milestone-based payments powered by Flare's FDC protocol.

**Problem:** When a client pays a creator for a sponsored video, trust is required on both sides. The client risks paying upfront for a video that underperforms. The creator risks not getting paid after doing the work. Centralized escrow services exist but introduce a trusted third party that could act dishonestly.

**Solution:** Replace the escrow with smart contracts on Flare. Use Flare's FDC (JsonApi attestation) to trustlessly verify YouTube view counts and video integrity (etag) on-chain. The smart contract automatically releases funds as milestones are hit.

## Tech Stack

- **Frontend:** Next.js + React
- **Auth:** Wallet (MetaMask) + Google OAuth (YouTube channel verification + upload)
- **Database:** Supabase (Postgres + realtime + storage)
- **Smart Contracts:** Solidity on Coston2 (Flare testnet)
- **Oracle:** Flare FDC — JsonApi attestation type
- **Payments:** Stablecoins (USDC/USDT)

## User Roles

- **Client** — posts video orders, defines milestones/budgets, reviews and approves videos
- **Creator** — browses marketplace, applies to orders, creates and uploads videos, gets paid on performance

## User Flows

### Client Flow

1. Sign up — connect wallet + Google account
2. Create order — fill out form:
    - Video topic and detailed documentation/brief
    - Payment mode: Milestone or Linear
    - If milestone: define N milestones (view count, payout amount, deadline)
    - If linear: set rate per view + total cap
    - Video creation deadline
    - Stablecoin to pay in
3. Order goes live on the marketplace
4. Receive applications from creators — review profiles, ratings, past work
5. Accept a creator — case begins, creation deadline starts
6. Review video — creator uploads to YouTube as private via the platform, client gets the link
7. Approve or reject — if approved, funds deposited to smart contract, video set to public via YouTube API
8. Track progress — dashboard shows view count, milestones hit, payouts made

### Creator Flow

1. Sign up — connect wallet + Google OAuth (grants YouTube upload permissions)
2. Build profile — channel info pulled from YouTube, rating starts at zero
3. Browse marketplace — filter/search orders
4. Apply to an order — send application to client
5. Get accepted — creation deadline starts
6. Create and upload video — upload through the platform (goes to YouTube as private)
7. Wait for approval — client reviews, approves
8. Get paid automatically — as milestones are hit, funds arrive in wallet

## Smart Contract Architecture

### Contract: TrustTube.sol

**Deal states:**

- `Open` — order listed, no creator assigned
- `InProgress` — creator accepted, working on video
- `InReview` — video uploaded privately, client reviewing
- `Active` — client approved, funds deposited, video public, milestones tracked
- `Completed` — all milestones paid out or deadlines expired
- `Terminated` — video tampered (etag changed), funds returned

**Key functions:**

- `createOrder(...)` — client creates order with milestones/linear config and deadlines
- `acceptCreator(dealId, creatorAddress)` — client assigns a creator
- `submitVideo(dealId, youtubeVideoId, etag)` — creator submits video for review
- `approveVideo(dealId)` — client approves, deposits stablecoins into contract
- `claimMilestone(dealId, milestoneIndex, fdcProof)` — anyone submits FDC proof of view count, contract verifies and releases funds
- `claimLinear(dealId, fdcProof)` — for linear mode, claim based on current view count
- `reportTampering(dealId, fdcProof)` — submit proof that etag changed, triggers fund return
- `claimExpired(dealId, milestoneIndex)` — if milestone deadline passed, client reclaims funds

## FDC Integration

Uses JsonApi attestation type to query YouTube Data API v3.

### Two attestation requests:

**1. View count proof**

- URL: `https://www.googleapis.com/youtube/v3/videos?id={videoId}&part=statistics&key={apiKey}`
- JQ transform: extracts `.items[0].statistics.viewCount`
- Returns: `(videoId, viewCount)` ABI-encoded
- Used by: `claimMilestone()` / `claimLinear()`

**2. Etag proof**

- URL: `https://www.googleapis.com/youtube/v3/videos?id={videoId}&part=snippet&key={apiKey}`
- JQ transform: extracts `.etag`
- Returns: `(videoId, currentEtag)` ABI-encoded
- Contract compares against stored etag — if different, triggers termination

### Proof workflow:

1. Keeper bot prepares attestation request
2. Submits to `FdcHub.requestAttestation()`
3. Waits for voting round to finalize (~3-5 minutes)
4. Fetches response + Merkle proof from DA Layer
5. Submits proof to TrustTube contract, which verifies via `FdcVerification` contract

### Keeper bot

Runs on a schedule — checks active deals, submits view count proofs when milestones are likely hit, periodically checks etags for tampering.

## Database Schema (Supabase)

### Tables:

**users**

- wallet_address, google_id, role (client/creator/both), created_at

**creator_profiles**

- user_id, youtube_channel_id, channel_name, subscribers, bio, avatar_url, rating

**orders**

- user_id (client), title, description, documentation, payment_mode (milestone/linear), linear_rate, linear_cap, stablecoin_address, video_deadline_days, status, contract_deal_id, created_at

**milestones**

- order_id, view_target, payout_amount, deadline_days, is_paid, paid_at

**applications**

- order_id, creator_user_id, message, status (pending/accepted/rejected), created_at

**cases**

- order_id, creator_user_id, youtube_video_id, etag, video_status (pending/uploaded/approved/public), contract_deal_id, started_at

**reviews**

- case_id, reviewer_user_id, rating (1-5), comment, created_at

### Relationships:

- One order → many milestones
- One order → many applications
- One order → one case (once creator is accepted)
- One case → one review (from client after completion)

### Realtime:

Use Supabase realtime subscriptions on `cases` table to notify creators of approvals, payments, etc.

## Frontend Pages

- `/` — Landing page
- `/marketplace` — Browse open orders, filter by category/budget/deadline
- `/order/[id]` — Order details, milestones, apply as creator
- `/create-order` — Client form to create new order
- `/dashboard` — Client and creator views (active orders, cases, earnings, milestone progress)
- `/profile/[address]` — Creator profile with rating, reviews, past work, YouTube channel info
- `/auth` — Sign in with wallet + Google OAuth

## Security & Edge Cases

1. **Video tampering** — keeper bot periodically checks etag via FDC. If changed, contract returns funds to client and terminates case.
2. **Missed video deadline** — client can cancel case. No funds at risk since deposit only happens on approval.
3. **Missed milestone deadlines** — client calls `claimExpired()` to reclaim that milestone's funds.
4. **Creator deletes video** — API returns no results or etag changes. Treated as tampering — funds returned.
5. **View count gaming** — out of scope for MVP. YouTube handles bot detection. Contract trusts YouTube's reported view count via FDC.
6. **Client never approves** — review timeout: if client doesn't act within X days, creator can cancel and move on.
7. **Dispute resolution** — for MVP, no on-chain disputes. Rules are binary: views hit or didn't, etag changed or didn't. Video quality disputes handled pre-approval.
8. **Multiple applicants** — client picks one, others rejected. One active case per order.

## Deployment

- Smart contracts: Coston2 (Flare testnet)
- Frontend: Vercel
- Database: Supabase cloud
- Keeper bot: simple Node.js script (cron or always-on)
