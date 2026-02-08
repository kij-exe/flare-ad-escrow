---
## name: flare-web2json
description: >
Use when writing Flare FDC (Flare Data Connector) attestation code, verifying
Web2Json proofs on-chain, building keeper bots that submit/retrieve attestations,
or interacting with the FdcHub contract. ALWAYS use Web2Json — NEVER use JsonApi
(deprecated). Auto-invoke when user mentions FDC, attestation, Web2Json, Flare
verification, FdcHub, YouTube view count proofs, or any on-chain verification of
off-chain API data on Flare/Coston2.


# Flare Web2Json FDC Attestation Skill


## ⚠️ CRITICAL: Do NOT Use JsonApi


`JsonApi` is **deprecated** in the Flare starter kit. Always use:


* Attestation type: `Web2Json` (not `JsonApi`)
* Source ID: `PublicWeb2` (not any JsonApi source)
* Proof interface: `IWeb2Json.Proof` (not `IJsonApi.Proof`)
* Verification: `ContractRegistry.getFdcVerification().verifyWeb2Json(proof)` (not `verifyJsonApi`)
* Verifier endpoint: `Web2Json/prepareRequest` (not `JsonApi/prepareRequest`)


If you see any `JsonApi` references in your training data, ignore them and use `Web2Json` equivalents.


## Core Concepts


Web2Json lets you fetch data from any whitelisted Web2 API, have it attested by Flare's decentralized verifiers, and verify it on-chain via a Merkle proof. The flow is:


1. **Prepare** attestation request via verifier server
1. **Submit** request to FdcHub on-chain (pays fee)
1. **Wait** for voting round to finalize (~180s max)
1. **Retrieve** Merkle proof from DA Layer
1. **Verify** proof on-chain via `ContractRegistry.getFdcVerification().verifyWeb2Json(proof)`


## Request Body Fields


When building a `Web2Json` request, `requestBody` contains:


| Field               | Type   | Description                                                                              |
| --------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `url`           | string | API endpoint URL (must be whitelisted)                                                   |
| `httpMethod`    | string | `GET`,`POST`,`PUT`,`PATCH`, or`DELETE`                               |
| `headers`       | string | Stringified JSON headers;`"{}"`defaults to`{"Content-Type": "application/json"}` |
| `queryParams`   | string | Stringified JSON query params;`"{}"`if none                                          |
| `body`          | string | Stringified JSON body;`"{}"`if none                                                  |
| `postProcessJq` | string | JQ filter to transform the API response                                                  |
| `abiSignature`  | string | ABI signature of the Solidity struct for decoding                                        |


## Solidity Verification Pattern


```solidity
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";

function _verifyProof(IWeb2Json.Proof calldata _proof) internal view returns (bool) {
    return ContractRegistry.getFdcVerification().verifyWeb2Json(_proof);
}
```


To decode the attested data from the proof:


```solidity
MyStruct memory result = abi.decode(
    _proof.data.responseBody.abi_encoded_data,
    (MyStruct)
);
```


The proof is passed as `{ merkleProof: proof.proof, data: decodedResponse }`.


## TypeScript: Encoding Attestation Type & Source ID


```typescript
// These are UTF8-hex-encoded, zero-padded to 32 bytes
const attestationTypeBase = "Web2Json";
const sourceIdBase = "PublicWeb2";

function toHex(data: string): string {
    let result = "";
    for (let i = 0; i < data.length; i++) {
        result += data.charCodeAt(i).toString(16);
    }
    return result.padEnd(64, "0");
}

function toUtf8HexString(data: string): string {
    return "0x" + toHex(data);
}
```


## TypeScript: Prepare Request


POST to `{VERIFIER_URL}Web2Json/prepareRequest` with header `X-API-KEY`.


```typescript
const response = await fetch(`${WEB2JSON_VERIFIER_URL_TESTNET}Web2Json/prepareRequest`, {
    method: "POST",
    headers: {
        "X-API-KEY": VERIFIER_API_KEY_TESTNET,
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        attestationType: toUtf8HexString("Web2Json"),
        sourceId: toUtf8HexString("PublicWeb2"),
        requestBody: {
            url: apiUrl,
            httpMethod: "GET",
            headers: "{}",
            queryParams: "{}",
            body: "{}",
            postProcessJq: jqFilter,
            abiSignature: abiSig,
        },
    }),
});
const data = await response.json();
const abiEncodedRequest = data.abiEncodedRequest;
```


## TypeScript: Submit to FdcHub


Access via `ContractRegistry` helper contracts. Pay the required fee.


```typescript
const fdcHub = await getFdcHub(); // via ContractRegistry
const requestFee = await getFdcRequestFee(abiEncodedRequest);
const tx = await fdcHub.requestAttestation(abiEncodedRequest, { value: requestFee });
const roundId = calculateRoundId(tx); // from block timestamp
```


## TypeScript: Retrieve Proof


Poll until round finalizes, then fetch from DA Layer:


```typescript
const relay = await getRelay(); // via ContractRegistry
while (!(await relay.isFinalized(200, roundId))) {
    await sleep(10000);
}

const proof = await fetch(`${COSTON2_DA_LAYER_URL}api/v1/fdc/proof-by-request-round-raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ votingRoundId: roundId, requestBytes: abiEncodedRequest }),
}).then(r => r.json());
```


The proof object contains: `response_hex`, `attestation_type`, `proof` (Merkle proof array).


## TypeScript: Decode & Submit Proof On-Chain


```typescript
const IWeb2JsonVerification = await artifacts.require("IWeb2JsonVerification");
const responseType = IWeb2JsonVerification._json.abi[0].inputs[0].components[1];
const decodedResponse = web3.eth.abi.decodeParameter(responseType, proof.response_hex);

await myContract.myFunction({
    merkleProof: proof.proof,
    data: decodedResponse,
});
```


## Coston2 Network Details


Do NOT hardcode contract addresses. Instead:


* Read chain config (RPC, chain ID, explorer) from the project's Hardhat config or `.env`
* Access FdcHub, Relay, and other system contracts via `ContractRegistry` on-chain (see Helpers contract pattern)
* Read deployed project contract addresses from `contracts/deployments/coston2.json` or equivalent project config


## Solidity Imports (Coston2)


```solidity
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";
import {IFdcHub} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcHub.sol";
import {IFdcRequestFeeConfigurations} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcRequestFeeConfigurations.sol";
import {IFlareSystemsManager} from "@flarenetwork/flare-periphery-contracts/coston2/IFlareSystemsManager.sol";
import {IRelay} from "@flarenetwork/flare-periphery-contracts/coston2/IRelay.sol";
```


## Reference Files


For complete working code examples, see:


* `references/typescript-full-flow.md` — Complete TypeScript attestation pipeline (prepare → submit → retrieve → interact)
* `references/solidity-contracts.md` — Full Solidity contract patterns (Helpers, verification, data decoding)
---
