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

function buildContractProof(proof: any) {
    const responseType = IWeb2JsonVerification._json.abi[0].inputs[0].components[1];
    const decodedResponse = web3.eth.abi.decodeParameter(responseType, proof.response_hex);
    return {
        merkleProof: proof.proof,
        data: decodedResponse,
    };
}

/**
 * Execute a view count check for a deal with progress callbacks.
 * Handles both Milestone and Linear payment modes.
 */
export async function executeViewCountCheck(
    trustTube: any,
    dealId: number,
    deal: any,
    onProgress: (update: Partial<CheckState>) => void
): Promise<void> {
    const videoId = deal.youtubeVideoId;
    const paymentMode = Number(deal.paymentMode);

    // Step 1: Off-chain check
    onProgress({ status: "off-chain-check" });
    const currentViews = await checkViewCountOffChain(videoId);
    if (currentViews === 0) {
        onProgress({
            status: "completed",
            completedAt: Date.now(),
            result: { viewCount: 0, message: "Could not fetch view count" },
        });
        return;
    }

    // For milestone mode, check each unpaid milestone
    if (paymentMode === 0) {
        const milestones = await trustTube.getMilestones(dealId);
        let claimed = false;

        for (let i = 0; i < milestones.length; i++) {
            const ms = milestones[i];
            if (ms.isPaid) continue;

            const viewTarget = Number(ms.viewTarget);
            if (currentViews < viewTarget) {
                continue;
            }

            // Target reached — submit FDC attestation
            onProgress({
                status: "preparing",
                result: { viewCount: currentViews, message: `Milestone ${i}: ${currentViews}/${viewTarget}` },
            });
            const requestBody = prepareViewCountAttestation(videoId);

            const verifierUrl = `${VERIFIER_URL_TESTNET}/verifier/web2/Web2Json/prepareRequest`;
            const apiKey = VERIFIER_API_KEY_TESTNET ?? "";
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
            const roundId = await submitAttestationRequest(data.abiEncodedRequest);
            onProgress({ status: "waiting-round", roundId });

            // Wait for round finalization
            const relay = await getRelay();
            const fdcVerification = await getFdcVerification();
            const protocolId = await fdcVerification.fdcProtocolId();
            while (!(await relay.isFinalized(protocolId, roundId))) {
                await sleep(30000);
            }

            onProgress({ status: "retrieving-proof" });
            const daLayerUrl = `${COSTON2_DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`;
            const proofRequest = { votingRoundId: roundId, requestBytes: data.abiEncodedRequest };
            await sleep(10000);
            let proof = await postRequestToDALayer(daLayerUrl, proofRequest, true);
            while (proof.response_hex === undefined) {
                await sleep(10000);
                proof = await postRequestToDALayer(daLayerUrl, proofRequest, false);
            }

            onProgress({ status: "claiming" });
            const contractProof = buildContractProof(proof);
            const tx = await trustTube.claimMilestone(dealId, i, contractProof);

            onProgress({
                status: "completed",
                completedAt: Date.now(),
                result: { txHash: tx.tx, viewCount: currentViews, message: `Milestone ${i} claimed` },
            });
            claimed = true;
            break; // One milestone per check to avoid consuming multiple rounds
        }

        if (!claimed) {
            onProgress({
                status: "completed",
                completedAt: Date.now(),
                result: { viewCount: currentViews, message: "No milestones ready to claim" },
            });
        }
    } else {
        // Linear mode
        const linearConfig = await trustTube.getLinearConfig(dealId);
        const lastClaimedViews = Number(linearConfig.lastClaimedViews);
        const ratePerView = Number(linearConfig.ratePerView);
        const totalCap = Number(linearConfig.totalCap);
        const totalPaid = Number(deal.totalPaid);

        if (currentViews <= lastClaimedViews) {
            onProgress({
                status: "completed",
                completedAt: Date.now(),
                result: { viewCount: currentViews, message: `No new views (${currentViews} <= ${lastClaimedViews})` },
            });
            return;
        }

        const newViews = currentViews - lastClaimedViews;
        let potentialPayment = newViews * ratePerView;
        const remainingCap = totalCap - totalPaid;
        if (potentialPayment > remainingCap) potentialPayment = remainingCap;

        if (potentialPayment === 0) {
            onProgress({
                status: "completed",
                completedAt: Date.now(),
                result: { viewCount: currentViews, message: "Cap reached, no payment due" },
            });
            return;
        }

        onProgress({
            status: "preparing",
            result: { viewCount: currentViews, payout: String(potentialPayment), message: `${newViews} new views` },
        });
        const requestBody = prepareViewCountAttestation(videoId);

        const verifierUrl = `${VERIFIER_URL_TESTNET}/verifier/web2/Web2Json/prepareRequest`;
        const apiKey = VERIFIER_API_KEY_TESTNET ?? "";
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
        const roundId = await submitAttestationRequest(data.abiEncodedRequest);
        onProgress({ status: "waiting-round", roundId });

        const relay = await getRelay();
        const fdcVerification = await getFdcVerification();
        const protocolId = await fdcVerification.fdcProtocolId();
        while (!(await relay.isFinalized(protocolId, roundId))) {
            await sleep(30000);
        }

        onProgress({ status: "retrieving-proof" });
        const daLayerUrl = `${COSTON2_DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`;
        const proofRequest = { votingRoundId: roundId, requestBytes: data.abiEncodedRequest };
        await sleep(10000);
        let proof = await postRequestToDALayer(daLayerUrl, proofRequest, true);
        while (proof.response_hex === undefined) {
            await sleep(10000);
            proof = await postRequestToDALayer(daLayerUrl, proofRequest, false);
        }

        onProgress({ status: "claiming" });
        const contractProof = buildContractProof(proof);
        const tx = await trustTube.claimLinear(dealId, contractProof);

        onProgress({
            status: "completed",
            completedAt: Date.now(),
            result: {
                txHash: tx.tx,
                viewCount: currentViews,
                payout: String(potentialPayment),
                message: "Linear claim submitted",
            },
        });
    }
}

/**
 * Execute an etag tampering check for a deal with progress callbacks.
 */
export async function executeEtagCheck(
    trustTube: any,
    dealId: number,
    deal: any,
    onProgress: (update: Partial<CheckState>) => void
): Promise<void> {
    const videoId = deal.youtubeVideoId;

    onProgress({ status: "preparing" });
    const requestBody = prepareEtagAttestation(videoId);

    const verifierUrl = `${VERIFIER_URL_TESTNET}/verifier/web2/Web2Json/prepareRequest`;
    const apiKey = VERIFIER_API_KEY_TESTNET ?? "";
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
    const roundId = await submitAttestationRequest(data.abiEncodedRequest);
    onProgress({ status: "waiting-round", roundId });

    const relay = await getRelay();
    const fdcVerification = await getFdcVerification();
    const protocolId = await fdcVerification.fdcProtocolId();
    while (!(await relay.isFinalized(protocolId, roundId))) {
        await sleep(30000);
    }

    onProgress({ status: "retrieving-proof" });
    const daLayerUrl = `${COSTON2_DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`;
    const proofRequest = { votingRoundId: roundId, requestBytes: data.abiEncodedRequest };
    await sleep(10000);
    let proof = await postRequestToDALayer(daLayerUrl, proofRequest, true);
    while (proof.response_hex === undefined) {
        await sleep(10000);
        proof = await postRequestToDALayer(daLayerUrl, proofRequest, false);
    }

    onProgress({ status: "claiming" });
    const contractProof = buildContractProof(proof);

    try {
        const tx = await trustTube.reportTampering(dealId, contractProof);
        onProgress({
            status: "completed",
            completedAt: Date.now(),
            result: { txHash: tx.tx, message: "Tampering reported!" },
        });
    } catch (contractError: any) {
        if (contractError.message?.includes("EtagNotChanged")) {
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
