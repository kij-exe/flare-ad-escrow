import { web3 } from "hardhat";
import { sleep } from "../../utils/core";
import {
    prepareViewCountAttestation,
    prepareEtagAttestation,
    submitAndRetrieveProof,
    checkViewCountOffChain,
} from "./fdc-utils";

const TrustTube = artifacts.require("TrustTube");
const IWeb2JsonVerification = artifacts.require("IWeb2JsonVerification");

// ─── Configuration ──────────────────────────────────────────

// The deployed TrustTube contract address — set via environment or hardcode after deploy
const TRUSTTUBE_ADDRESS = process.env.TRUSTTUBE_ADDRESS || "";

// Polling interval: 5 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Etag check every 6th cycle (30 minutes)
const ETAG_CHECK_CYCLE = 6;

// DealStatus enum mirrors the Solidity enum
enum DealStatus {
    Open = 0,
    InProgress = 1,
    InReview = 2,
    Active = 3,
    Completed = 4,
    Terminated = 5,
}

// PaymentMode enum mirrors the Solidity enum
enum PaymentMode {
    Milestone = 0,
    Linear = 1,
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Decode the FDC proof response_hex into the IWeb2Json data structure
 * and build the proof object expected by the TrustTube contract.
 */
function buildContractProof(proof: any) {
    // Read the response type from the IWeb2JsonVerification ABI
    const responseType = IWeb2JsonVerification._json.abi[0].inputs[0].components[1];
    const decodedResponse = web3.eth.abi.decodeParameter(responseType, proof.response_hex);

    return {
        merkleProof: proof.proof,
        data: decodedResponse,
    };
}

// ─── Active Deal Query ──────────────────────────────────────

/**
 * Iterate over all deals and return those with Active status.
 */
async function getActiveDeals(trustTube: any): Promise<any[]> {
    const nextDealId = Number(await trustTube.nextDealId());
    const activeDeals: any[] = [];

    for (let i = 0; i < nextDealId; i++) {
        try {
            const deal = await trustTube.getDeal(i);
            if (Number(deal.status) === Number(DealStatus.Active)) {
                activeDeals.push(deal);
            }
        } catch (error) {
            console.log(`Error fetching deal ${i}:`, error);
        }
    }

    console.log(`Found ${activeDeals.length} active deal(s) out of ${nextDealId} total.\n`);
    return activeDeals;
}

// ─── Milestone Processing ───────────────────────────────────

/**
 * For any active deal, check if the off-chain view count is higher
 * than the on-chain lastVerifiedViews. If so, submit an FDC
 * attestation and call updateViews on-chain.
 */
async function updateViewsForDeal(trustTube: any, deal: any) {
    const dealId = Number(deal.id);
    const videoId = deal.youtubeVideoId;
    const lastVerified = Number(deal.lastVerifiedViews);

    console.log(`Checking views for deal #${dealId} (video: ${videoId}, last verified: ${lastVerified})...\n`);

    const currentViews = await checkViewCountOffChain(videoId);
    if (currentViews === 0) {
        console.log(`Skipping deal #${dealId}: could not fetch view count.\n`);
        return;
    }

    if (currentViews <= lastVerified) {
        console.log(`  No new views since last update (${currentViews} <= ${lastVerified}).\n`);
        return;
    }

    console.log(
        `  ${currentViews - lastVerified} new views detected (${lastVerified} → ${currentViews}). Submitting FDC attestation...\n`
    );

    try {
        const requestBody = prepareViewCountAttestation(videoId);
        const proof = await submitAndRetrieveProof(requestBody);
        const contractProof = buildContractProof(proof);

        const tx = await trustTube.updateViews(dealId, contractProof);
        console.log(`  Views updated on-chain! TX: ${tx.tx}\n`);
    } catch (error) {
        console.log(`  Error updating views for deal #${dealId}:`, error, "\n");
    }
}

// ─── Etag Tampering Check ───────────────────────────────────

/**
 * For each active deal, fetch the current etag via FDC attestation
 * and call reportTampering if the etag has changed from the stored hash.
 */
async function checkEtags(trustTube: any, activeDeals: any[]) {
    console.log("=== Running etag tampering check ===\n");

    for (const deal of activeDeals) {
        const dealId = Number(deal.id);
        const videoId = deal.youtubeVideoId;

        console.log(`Checking etag for deal #${dealId} (video: ${videoId})...\n`);

        try {
            const requestBody = prepareEtagAttestation(videoId);
            const proof = await submitAndRetrieveProof(requestBody);
            const contractProof = buildContractProof(proof);

            // Attempt to report tampering — the contract will revert with
            // EtagNotChanged if the etag has not actually changed
            try {
                const tx = await trustTube.reportTampering(dealId, contractProof);
                console.log(`  Tampering reported for deal #${dealId}! TX: ${tx.tx}\n`);
            } catch (contractError: any) {
                // EtagNotChanged revert means no tampering — this is the expected case
                if (contractError.message && contractError.message.includes("EtagNotChanged")) {
                    console.log(`  Etag unchanged for deal #${dealId} — no tampering.\n`);
                } else {
                    console.log(`  Error calling reportTampering for deal #${dealId}:`, contractError, "\n");
                }
            }
        } catch (error) {
            console.log(`  Error checking etag for deal #${dealId}:`, error, "\n");
        }
    }
}

// ─── Main Loop ──────────────────────────────────────────────

async function main() {
    if (!TRUSTTUBE_ADDRESS) {
        throw new Error(
            "TRUSTTUBE_ADDRESS environment variable is required. " +
                "Set it to the deployed TrustTube contract address."
        );
    }

    console.log("=== TrustTube FDC Keeper Bot ===\n");
    console.log(`Contract address: ${TRUSTTUBE_ADDRESS}`);
    console.log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
    console.log(`Etag check every ${ETAG_CHECK_CYCLE} cycles (${(ETAG_CHECK_CYCLE * POLL_INTERVAL_MS) / 60000} min)\n`);

    const trustTube = await TrustTube.at(TRUSTTUBE_ADDRESS);
    console.log("Connected to TrustTube contract.\n");

    let cycleCount = 0;

    while (true) {
        cycleCount++;
        console.log(`\n========== Cycle ${cycleCount} (${new Date().toISOString()}) ==========\n`);

        try {
            // Step 1: Get all active deals
            const activeDeals = await getActiveDeals(trustTube);

            if (activeDeals.length === 0) {
                console.log("No active deals found. Sleeping...\n");
                await sleep(POLL_INTERVAL_MS);
                continue;
            }

            // Step 2: Update verified views for each active deal
            for (const deal of activeDeals) {
                await updateViewsForDeal(trustTube, deal);
            }

            // Step 3: Every 6th cycle, check etags for tampering
            if (cycleCount % ETAG_CHECK_CYCLE === 0) {
                await checkEtags(trustTube, activeDeals);
            }
        } catch (error) {
            console.log("Error in keeper cycle:", error, "\n");
        }

        console.log(`Sleeping for ${POLL_INTERVAL_MS / 1000}s...\n`);
        await sleep(POLL_INTERVAL_MS);
    }
}

void main().then(() => {
    process.exit(0);
});

// yarn hardhat run scripts/trusttube/keeper/index.ts --network coston2
