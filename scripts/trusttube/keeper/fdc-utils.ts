import { prepareAttestationRequestBase, submitAttestationRequest, retrieveDataAndProofBase } from "../../utils/fdc";

// ─── Configuration ──────────────────────────────────────────

const { VERIFIER_URL_TESTNET, VERIFIER_API_KEY_TESTNET, COSTON2_DA_LAYER_URL, WORKER_URL } = process.env;

const attestationTypeBase = "Web2Json";
const sourceIdBase = "PublicWeb2";

// ─── ABI Signatures ────────────────────────────────────────

const viewCountAbiSignature = `{"components": [{"internalType": "string", "name": "videoId", "type": "string"},{"internalType": "uint256", "name": "viewCount", "type": "uint256"}],"name": "task","type": "tuple"}`;

const etagAbiSignature = `{"components": [{"internalType": "string", "name": "videoId", "type": "string"},{"internalType": "string", "name": "etag", "type": "string"}],"name": "task","type": "tuple"}`;

// ─── Attestation Request Builders ──────────────────────────

/**
 * Build a Web2Json request body for YouTube video statistics (view count).
 *
 * Uses the Cloudflare Worker proxy (WORKER_URL) because googleapis.com
 * is unreachable from the FDC verifier infrastructure.
 * Query params must be passed via the `queryParams` field (not embedded in the URL).
 */
export function prepareViewCountAttestation(videoId: string) {
    const postProcessJq = `{videoId: .videoId, viewCount: .viewCount}`;

    return {
        url: WORKER_URL,
        httpMethod: "GET",
        headers: "{}",
        queryParams: JSON.stringify({ videoId }),
        body: "{}",
        postProcessJq: postProcessJq,
        abiSignature: viewCountAbiSignature,
    };
}

/**
 * Build a Web2Json request body for YouTube video etag.
 *
 * Uses the Cloudflare Worker proxy which returns the etag field
 * from the YouTube Data API v3 response.
 */
export function prepareEtagAttestation(videoId: string) {
    const postProcessJq = `{videoId: .videoId, etag: .etag}`;

    return {
        url: WORKER_URL,
        httpMethod: "GET",
        headers: "{}",
        queryParams: JSON.stringify({ videoId }),
        body: "{}",
        postProcessJq: postProcessJq,
        abiSignature: etagAbiSignature,
    };
}

// ─── Submit & Retrieve Proof ───────────────────────────────

/**
 * Submit an attestation request body to the FDC Hub (via the verifier),
 * wait for the round to finalize, and retrieve the Merkle proof from
 * the DA Layer.
 *
 * @param requestBody The Web2Json request body (from prepareViewCountAttestation or prepareEtagAttestation)
 * @returns The proof object containing `proof` (merkle proof) and `response_hex`
 */
export async function submitAndRetrieveProof(requestBody: any) {
    // Step 1: Prepare the attestation request via the verifier
    const verifierUrl = `${VERIFIER_URL_TESTNET}/verifier/web2/Web2Json/prepareRequest`;
    const apiKey = VERIFIER_API_KEY_TESTNET ?? "";

    console.log("Preparing attestation request...\n");
    const data = await prepareAttestationRequestBase(
        verifierUrl,
        apiKey,
        attestationTypeBase,
        sourceIdBase,
        requestBody
    );
    console.log("Attestation request prepared:", JSON.stringify(data), "\n");

    // Check if the verifier returned a valid response
    if (!data.abiEncodedRequest) {
        throw new Error(`FDC verifier rejected the request: ${data.status || JSON.stringify(data)}`);
    }

    const abiEncodedRequest = data.abiEncodedRequest;

    // Step 2: Submit to FDC Hub and get the round ID
    console.log("Submitting attestation request to FDC Hub...\n");
    const roundId = await submitAttestationRequest(abiEncodedRequest);
    console.log("Attestation submitted in round:", roundId, "\n");

    // Step 3: Wait for finalization and retrieve proof from DA Layer
    const daLayerUrl = `${COSTON2_DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`;
    console.log("Retrieving proof from DA Layer...\n");
    const proof = await retrieveDataAndProofBase(daLayerUrl, abiEncodedRequest, roundId);
    console.log("Proof retrieved successfully.\n");

    return proof;
}

// ─── Off-chain Quick Check ─────────────────────────────────

/**
 * Quick off-chain call to check the current view count for a video
 * without going through FDC. Uses the same Cloudflare Worker proxy
 * so no YouTube API key is needed in the keeper .env.
 *
 * @param videoId YouTube video ID
 * @returns Current view count as a number, or 0 on failure
 */
export async function checkViewCountOffChain(videoId: string): Promise<number> {
    const url = `${WORKER_URL}?videoId=${encodeURIComponent(videoId)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.log(`Worker returned status ${response.status} for video ${videoId}`);
            return 0;
        }

        const json = await response.json();
        if (json.error) {
            console.log(`Worker error for video ${videoId}: ${json.error}`);
            return 0;
        }

        const viewCount = json.viewCount;
        console.log(`Off-chain view count for ${videoId}: ${viewCount}`);
        return viewCount;
    } catch (error) {
        console.log(`Error checking view count off-chain for ${videoId}:`, error);
        return 0;
    }
}
