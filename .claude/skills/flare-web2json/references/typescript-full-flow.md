# Web2Json TypeScript Full Flow Reference

Complete working code for the Web2Json attestation pipeline.
Based on the official Flare Hardhat Starter.

## Environment Variables Required

```
PRIVATE_KEY=
WEB2JSON_VERIFIER_URL_TESTNET=    # e.g. https://fdc-verifiers-testnet.flare.network/verifier/web2/
VERIFIER_API_KEY_TESTNET=
COSTON2_DA_LAYER_URL=              # e.g. https://ctn2-data-availability.flare.network/
```

## Base Utilities (scripts/fdcExample/Base.ts)

### Hex Encoding

```typescript
function toHex(data: string): string {
    var result = "";
    for (var i = 0; i < data.length; i++) {
        result += data.charCodeAt(i).toString(16);
    }
    return result.padEnd(64, "0");
}

function toUtf8HexString(data: string): string {
    return "0x" + toHex(data);
}
```

### Helpers Contract Access

```typescript
async function getHelpers() {
    const helpers: HelpersInstance = await Helpers.new();
    return helpers;
}

async function getFdcHub() {
    const helpers = await getHelpers();
    const fdcHubAddress = await helpers.getFdcHub();
    return await FdcHub.at(fdcHubAddress);
}

async function getFdcRequestFee(abiEncodedRequest: string) {
    const helpers = await getHelpers();
    const addr = await helpers.getFdcRequestFeeConfigurations();
    const feeConfig = await FdcRequestFeeConfigurations.at(addr);
    return await feeConfig.getRequestFee(abiEncodedRequest);
}

async function getFlareSystemsManager() {
    const helpers = await getHelpers();
    const addr = await helpers.getFlareSystemsManager();
    return await FlareSystemsManager.at(addr);
}

async function getRelay() {
    const helpers = await getHelpers();
    const relayAddress = await helpers.getRelay();
    return await IRelay.at(relayAddress);
}
```

### Prepare Attestation Request (Base)

```typescript
async function prepareAttestationRequestBase(
    url: string,
    apiKey: string,
    attestationTypeBase: string,
    sourceIdBase: string,
    requestBody: any
) {
    const attestationType = toUtf8HexString(attestationTypeBase);
    const sourceId = toUtf8HexString(sourceIdBase);

    const request = {
        attestationType: attestationType,
        sourceId: sourceId,
        requestBody: requestBody,
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
    });

    if (response.status != 200) {
        throw new Error(`Response status is not OK, status ${response.status} ${response.statusText}`);
    }

    return await response.json();
}
```

### Submit Attestation Request

```typescript
async function submitAttestationRequest(abiEncodedRequest: string) {
    const fdcHub = await getFdcHub();
    const requestFee = await getFdcRequestFee(abiEncodedRequest);

    const transaction = await fdcHub.requestAttestation(abiEncodedRequest, {
        value: requestFee,
    });

    const roundId = await calculateRoundId(transaction);
    return roundId;
}
```

### Calculate Round ID

```typescript
async function calculateRoundId(transaction: any) {
    const blockNumber = transaction.receipt.blockNumber;
    const block = await ethers.provider.getBlock(blockNumber);
    const blockTimestamp = BigInt(block!.timestamp);

    const flareSystemsManager = await getFlareSystemsManager();
    const firstVotingRoundStartTs = BigInt(await flareSystemsManager.firstVotingRoundStartTs());
    const votingEpochDurationSeconds = BigInt(await flareSystemsManager.votingEpochDurationSeconds());

    const roundId = Number((blockTimestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds);
    return roundId;
}
```

### Retrieve Data and Proof (Base)

```typescript
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retrieveDataAndProofBase(url: string, abiEncodedRequest: string, roundId: number) {
    // Wait for round to finalize (check every 10s)
    const relay = await getRelay();
    while (!(await relay.isFinalized(200, roundId))) {
        await sleep(10000);
    }

    const request = {
        votingRoundId: roundId,
        requestBytes: abiEncodedRequest,
    };

    await sleep(10000);
    var proof = await postRequestToDALayer(url, request, true);

    // Wait for proof generation
    while (proof.response_hex == undefined) {
        await sleep(5000);
        proof = await postRequestToDALayer(url, request, false);
    }

    return proof;
}

async function postRequestToDALayer(url: string, request: any, watchStatus: boolean = false) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    if (watchStatus && response.status != 200) {
        throw new Error(`Response status is not OK, status ${response.status} ${response.statusText}`);
    }
    return await response.json();
}
```

## Web2Json-Specific Functions (scripts/fdcExample/Web2Json.ts)

### Configuration

```typescript
const { WEB2JSON_VERIFIER_URL_TESTNET, VERIFIER_API_KEY_TESTNET, COSTON2_DA_LAYER_URL } = process.env;

const attestationTypeBase = "Web2Json";
const sourceIdBase = "PublicWeb2";
const verifierUrlBase = WEB2JSON_VERIFIER_URL_TESTNET;
```

### Prepare Web2Json Request

```typescript
async function prepareAttestationRequest(apiUrl: string, postProcessJq: string, abiSignature: string) {
    const requestBody = {
        url: apiUrl,
        httpMethod: "GET",
        headers: "{}",
        queryParams: "{}",
        body: "{}",
        postProcessJq: postProcessJq,
        abiSignature: abiSignature,
    };

    const url = `${verifierUrlBase}Web2Json/prepareRequest`;
    const apiKey = VERIFIER_API_KEY_TESTNET;

    return await prepareAttestationRequestBase(url, apiKey, attestationTypeBase, sourceIdBase, requestBody);
}
```

### Retrieve Proof

```typescript
async function retrieveDataAndProof(abiEncodedRequest: string, roundId: number) {
    const url = `${COSTON2_DA_LAYER_URL}api/v1/fdc/proof-by-request-round-raw`;
    return await retrieveDataAndProofBase(url, abiEncodedRequest, roundId);
}
```

### Decode Proof & Interact with Contract

```typescript
async function interactWithContract(myContract: any, proof: any) {
    // Decode the response_hex into IWeb2Json.Response struct
    const IWeb2JsonVerification = await artifacts.require("IWeb2JsonVerification");
    const responseType = IWeb2JsonVerification._json.abi[0].inputs[0].components[1];

    const decodedResponse = web3.eth.abi.decodeParameter(responseType, proof.response_hex);

    // Submit proof to contract
    const transaction = await myContract.myFunction({
        merkleProof: proof.proof,
        data: decodedResponse,
    });
}
```

### Complete Main Function

```typescript
async function main() {
    // 1. Prepare
    const data = await prepareAttestationRequest(apiUrl, postProcessJq, abiSignature);
    const abiEncodedRequest = data.abiEncodedRequest;

    // 2. Submit
    const roundId = await submitAttestationRequest(abiEncodedRequest);

    // 3. Retrieve proof (waits for round finalization)
    const proof = await retrieveDataAndProof(abiEncodedRequest, roundId);

    // 4. Use on-chain
    const contract = await deployContract();
    await interactWithContract(contract, proof);
}
```

## Proof Response Structure

The DA Layer returns:

```typescript
{
    response_hex: "0x...",           // ABI-encoded IWeb2Json.Response
    attestation_type: "0x...",       // UTF8 hex of "Web2Json"
    proof: ["0x...", "0x...", ...]   // Merkle proof array (empty [] if single request in round)
}
```

## YouTube-Specific Example (TrustTube)

For fetching YouTube video statistics:

```typescript
const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;
const postProcessJq = `.items[0] | {videoId: .id, viewCount: (.statistics.viewCount | tonumber)}`;
const abiSignature = `{"components": [{"internalType": "string", "name": "videoId", "type": "string"},{"internalType": "uint256", "name": "viewCount", "type": "uint256"}],"name": "task","type": "tuple"}`;
```

For fetching etag (tampering detection):

```typescript
const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
const postProcessJq = `.items[0] | {videoId: .id, etag: .etag}`;
const abiSignature = `{"components": [{"internalType": "string", "name": "videoId", "type": "string"},{"internalType": "string", "name": "etag", "type": "string"}],"name": "task","type": "tuple"}`;
```
