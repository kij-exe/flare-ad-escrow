# Web2Json Solidity Contract Patterns

Complete Solidity patterns for Web2Json FDC proof verification on Coston2.

## Required Imports

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";
```

## ⚠️ NEVER Import These (Deprecated)

```solidity
// ❌ DO NOT USE:
// import {IJsonApi} from "@flarenetwork/flare-periphery-contracts/coston2/IJsonApi.sol";
// ContractRegistry.getFdcVerification().verifyJsonApi(proof)  ← WRONG
```

## Helpers Contract (Access Flare System Contracts)

```solidity
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IFdcHub} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcHub.sol";
import {IFdcRequestFeeConfigurations} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcRequestFeeConfigurations.sol";
import {IFlareSystemsManager} from "@flarenetwork/flare-periphery-contracts/coston2/IFlareSystemsManager.sol";
import {IRelay} from "@flarenetwork/flare-periphery-contracts/coston2/IRelay.sol";

contract Helpers {
    function getFdcHub() public view returns (IFdcHub) {
        return ContractRegistry.getFdcHub();
    }

    function getFdcRequestFeeConfigurations() public view returns (IFdcRequestFeeConfigurations) {
        return ContractRegistry.getFdcRequestFeeConfigurations();
    }

    function getFlareSystemsManager() public view returns (IFlareSystemsManager) {
        return ContractRegistry.getFlareSystemsManager();
    }

    function getRelay() public view returns (IRelay) {
        return ContractRegistry.getRelay();
    }
}
```

## Proof Verification Pattern

```solidity
function _verifyProof(IWeb2Json.Proof calldata _proof) internal view returns (bool) {
    return ContractRegistry.getFdcVerification().verifyWeb2Json(_proof);
}
```

## Data Decoding Pattern

Define a Data Transport Object (DTO) struct matching the `abiSignature` used in the attestation request:

```solidity
// Must match the abiSignature fields exactly
struct MyDTO {
    string videoId;
    uint256 viewCount;
}
```

Decode from proof:

```solidity
function _decodeData(IWeb2Json.Proof calldata _proof) internal pure returns (MyDTO memory) {
    return abi.decode(
        _proof.data.responseBody.abi_encoded_data,
        (MyDTO)
    );
}
```

## Complete Contract Example

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";

contract MyVerifier {
    struct DataTransportObject {
        string name;
        uint256 height;
        uint256 mass;
        uint256 numberOfFilms;
        uint256 uid;
    }

    struct Character {
        string name;
        uint256 numberOfFilms;
        uint256 uid;
        uint256 bmi;
    }

    mapping(uint256 => Character) public characters;
    uint256[] public characterIds;

    function isWeb2JsonProofValid(
        IWeb2Json.Proof calldata _proof
    ) private view returns (bool) {
        return ContractRegistry.getFdcVerification().verifyWeb2Json(_proof);
    }

    function addCharacter(IWeb2Json.Proof calldata data) public {
        require(isWeb2JsonProofValid(data), "Invalid proof");

        DataTransportObject memory dto = abi.decode(
            data.data.responseBody.abi_encoded_data,
            (DataTransportObject)
        );

        require(characters[dto.uid].uid == 0, "Already exists");

        characters[dto.uid] = Character({
            name: dto.name,
            numberOfFilms: dto.numberOfFilms,
            uid: dto.uid,
            bmi: (dto.mass * 100 * 100) / (dto.height * dto.height)
        });

        characterIds.push(dto.uid);
    }
}
```

## Proof Struct Shape (for TypeScript interaction)

When calling a Solidity function that accepts `IWeb2Json.Proof calldata`, pass:

```typescript
{
    merkleProof: proof.proof,       // string[] — Merkle proof from DA Layer
    data: decodedResponse           // Decoded IWeb2Json.Response struct
}
```

Where `decodedResponse` is obtained by:

```typescript
const IWeb2JsonVerification = await artifacts.require("IWeb2JsonVerification");
const responseType = IWeb2JsonVerification._json.abi[0].inputs[0].components[1];
const decodedResponse = web3.eth.abi.decodeParameter(responseType, proof.response_hex);
```

## TrustTube-Specific Pattern (YouTube View Count Verification)

```solidity
struct YouTubeViewData {
    string videoId;
    uint256 viewCount;
}

function claimMilestone(
    uint256 dealId,
    uint256 milestoneIndex,
    IWeb2Json.Proof calldata proof
) external {
    require(isWeb2JsonProofValid(proof), "Invalid FDC proof");

    YouTubeViewData memory data = abi.decode(
        proof.data.responseBody.abi_encoded_data,
        (YouTubeViewData)
    );

    Deal storage deal = deals[dealId];
    require(
        keccak256(bytes(data.videoId)) == keccak256(bytes(deal.youtubeVideoId)),
        "Video ID mismatch"
    );

    Milestone storage m = milestones[dealId][milestoneIndex];
    require(data.viewCount >= m.viewTarget, "View target not reached");
    require(!m.isPaid, "Already paid");

    m.isPaid = true;
    deal.totalPaid += m.payoutAmount;
    IERC20(deal.stablecoin).transfer(deal.creator, m.payoutAmount);
}
```

## Etag Tampering Detection Pattern

```solidity
struct YouTubeEtagData {
    string videoId;
    string etag;
}

function reportTampering(
    uint256 dealId,
    IWeb2Json.Proof calldata proof
) external {
    require(isWeb2JsonProofValid(proof), "Invalid FDC proof");

    YouTubeEtagData memory data = abi.decode(
        proof.data.responseBody.abi_encoded_data,
        (YouTubeEtagData)
    );

    Deal storage deal = deals[dealId];
    bytes32 currentEtagHash = keccak256(bytes(data.etag));

    if (currentEtagHash != deal.etag) {
        deal.status = DealStatus.Terminated;
        // Return remaining funds to client
        uint256 remaining = deal.totalDeposited - deal.totalPaid;
        IERC20(deal.stablecoin).transfer(deal.client, remaining);
    }
}
```
