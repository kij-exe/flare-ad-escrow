import { web3 } from "hardhat";
import { sleep } from "../../utils/core";
import { prepareAttestationRequestBase, submitAttestationRequest, postRequestToDALayer } from "../../utils/fdc";
import { getRelay, getFdcVerification } from "../../utils/getters";
import { prepareViewCountAttestation, prepareEtagAttestation, checkViewCountOffChain } from "./fdc-utils";
import type { CheckState } from "./types";

const IWeb2JsonVerification = artifacts.require("IWeb2JsonVerification");

const { VERIFIER_URL_TESTNET, VERIFIER_API_KEY_TESTNET, COSTON2_DA_LAYER_URL } = process.env;

const attestationTypeBase = "Web2Json";
const sourceIdBase = "PublicWeb2";

const PROOF_RETRIEVAL_MAX_ATTEMPTS = 30; // ~5 minutes

function buildContractProof(proof: any) {
    const responseType = IWeb2JsonVerification._json.abi[0].inputs[0].components[1];
    const decodedResponse = web3.eth.abi.decodeParameter(responseType, proof.response_hex);
    return {
        merkleProof: proof.proof,
        data: decodedResponse,
    };
}

/**
 * Submit an FDC attestation, wait for the round to finalize,
 * retrieve the proof from the DA Layer, and return it.
 */
async function submitAndWaitForProof(requestBody: any, onProgress: (update: Partial<CheckState>) => void) {
    const verifierUrl = `${VERIFIER_URL_TESTNET}/verifier/web2/Web2Json/prepareRequest`;
    const apiKey = VERIFIER_API_KEY_TESTNET ?? "";

    onProgress({ status: "preparing" });
    console.log("[check-executor] Preparing attestation request...");
    const data = await prepareAttestationRequestBase(
        verifierUrl,
        apiKey,
        attestationTypeBase,
        sourceIdBase,
        requestBody
    );

    if (!data.abiEncodedRequest) {
        throw new Error(`FDC verifier rejected: ${data.status || JSON.stringify(data)}`);
    }

    onProgress({ status: "submitting" });
    console.log("[check-executor] Submitting to FDC Hub...");
    const roundId = await submitAttestationRequest(data.abiEncodedRequest);
    onProgress({ status: "waiting-round", roundId });
    console.log(`[check-executor] Submitted in round ${roundId}, waiting for finalization...`);

    // Wait for round finalization
    const relay = await getRelay();
    const fdcVerification = await getFdcVerification();
    const protocolId = await fdcVerification.fdcProtocolId();
    while (!(await relay.isFinalized(protocolId, roundId))) {
        await sleep(30000);
    }
    console.log("[check-executor] Round finalized!");

    // Retrieve proof from DA Layer
    onProgress({ status: "retrieving-proof" });
    const daLayerUrl = `${COSTON2_DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`;
    console.log(`[check-executor] Retrieving proof from ${daLayerUrl}`);
    const proofRequest = {
        votingRoundId: roundId,
        requestBytes: data.abiEncodedRequest,
    };

    await sleep(10000);
    let proof = await postRequestToDALayer(daLayerUrl, proofRequest, true);
    let attempts = 0;
    while (proof.response_hex === undefined) {
        attempts++;
        if (attempts >= PROOF_RETRIEVAL_MAX_ATTEMPTS) {
            console.log("[check-executor] DA Layer response after timeout:", JSON.stringify(proof));
            throw new Error(`DA Layer did not return proof after ${PROOF_RETRIEVAL_MAX_ATTEMPTS} attempts`);
        }
        console.log(`[check-executor] Proof not ready, attempt ${attempts}/${PROOF_RETRIEVAL_MAX_ATTEMPTS}...`);
        await sleep(10000);
        proof = await postRequestToDALayer(daLayerUrl, proofRequest, false);
    }
    console.log("[check-executor] Proof retrieved successfully!");

    return buildContractProof(proof);
}

/**
 * Execute a view count check for a deal.
 * The keeper only calls updateViews() — creators claim on the frontend.
 */
export async function executeViewCountCheck(
    trustTube: any,
    dealId: number,
    deal: any,
    onProgress: (update: Partial<CheckState>) => void
): Promise<void> {
    const videoId = deal.youtubeVideoId;
    const lastVerified = Number(deal.lastVerifiedViews);

    // Step 1: Off-chain check
    onProgress({ status: "off-chain-check" });
    console.log(
        `[check-executor] Deal #${dealId}: checking views (video: ${videoId}, last verified: ${lastVerified})...`
    );
    const currentViews = await checkViewCountOffChain(videoId);
    if (currentViews === 0) {
        console.log(`[check-executor] Deal #${dealId}: could not fetch view count.`);
        onProgress({
            status: "completed",
            completedAt: Date.now(),
            result: { viewCount: 0, message: "Could not fetch view count" },
        });
        return;
    }

    if (currentViews <= lastVerified) {
        console.log(`[check-executor] Deal #${dealId}: no new views (${currentViews} <= ${lastVerified}).`);
        onProgress({
            status: "completed",
            completedAt: Date.now(),
            result: {
                viewCount: currentViews,
                message: `No new views (${currentViews} <= ${lastVerified})`,
            },
        });
        return;
    }

    console.log(
        `[check-executor] Deal #${dealId}: ${currentViews - lastVerified} new views detected (${lastVerified} -> ${currentViews}). Submitting FDC attestation...`
    );

    // Step 2: Submit attestation, wait, retrieve proof
    onProgress({
        status: "preparing",
        result: {
            viewCount: currentViews,
            message: `${currentViews - lastVerified} new views`,
        },
    });
    const requestBody = prepareViewCountAttestation(videoId);
    const contractProof = await submitAndWaitForProof(requestBody, onProgress);

    // Step 3: Call updateViews on-chain (NOT claimMilestone/claimLinear)
    onProgress({ status: "claiming" });
    console.log(`[check-executor] Deal #${dealId}: calling updateViews on-chain...`);
    const tx = await trustTube.updateViews(dealId, contractProof);
    console.log(`[check-executor] Deal #${dealId}: views updated! TX: ${tx.tx}`);

    onProgress({
        status: "completed",
        completedAt: Date.now(),
        result: {
            txHash: tx.tx,
            viewCount: currentViews,
            message: `Views updated on-chain (${currentViews})`,
        },
    });
}

/**
 * Execute an etag tampering check for a deal.
 */
export async function executeEtagCheck(
    trustTube: any,
    dealId: number,
    deal: any,
    onProgress: (update: Partial<CheckState>) => void
): Promise<void> {
    const videoId = deal.youtubeVideoId;

    console.log(`[check-executor] Deal #${dealId}: checking etag (video: ${videoId})...`);

    const requestBody = prepareEtagAttestation(videoId);
    const contractProof = await submitAndWaitForProof(requestBody, onProgress);

    onProgress({ status: "claiming" });
    console.log(`[check-executor] Deal #${dealId}: calling reportTampering on-chain...`);

    try {
        const tx = await trustTube.reportTampering(dealId, contractProof);
        console.log(`[check-executor] Deal #${dealId}: tampering reported! TX: ${tx.tx}`);
        onProgress({
            status: "completed",
            completedAt: Date.now(),
            result: { txHash: tx.tx, message: "Tampering reported!" },
        });
    } catch (contractError: any) {
        if (contractError.message?.includes("EtagNotChanged")) {
            console.log(`[check-executor] Deal #${dealId}: etag unchanged — no tampering.`);
            onProgress({
                status: "completed",
                completedAt: Date.now(),
                result: { message: "Etag unchanged — no tampering" },
            });
        } else {
            throw contractError;
        }
    }
}
