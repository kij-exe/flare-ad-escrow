// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IWeb2Json } from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";
import { ContractRegistry } from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";

/// @title TrustTube — Decentralized YouTube sponsorship escrow
/// @notice Milestone and linear payment modes with FDC-verified YouTube view counts
contract TrustTube {
    using SafeERC20 for IERC20;

    // ─── Enums ──────────────────────────────────────────────

    enum DealStatus {
        Open, // Order listed, no creator assigned
        InProgress, // Creator accepted, working on video
        InReview, // Video uploaded, client reviewing
        Active, // Client approved, funds deposited, milestones tracked
        Completed, // All milestones paid or deadlines expired
        Terminated // Video tampered, funds returned
    }

    enum PaymentMode {
        Milestone,
        Linear
    }

    // ─── Structs ────────────────────────────────────────────

    struct MilestoneConfig {
        uint256 viewTarget;
        uint256 payoutAmount;
        uint256 deadlineDuration; // seconds after activation
        uint256 deadlineTimestamp; // set when deal goes Active
        bool isPaid;
    }

    struct LinearConfig {
        uint256 ratePerView; // payment per view (in token smallest unit)
        uint256 totalCap; // max total payout
        uint256 lastClaimedViews;
    }

    struct Deal {
        uint256 id;
        address client;
        address creator;
        address stablecoin;
        PaymentMode paymentMode;
        DealStatus status;
        string youtubeVideoId;
        bytes32 etagHash; // keccak256(etag) for gas-efficient comparison
        uint256 videoDeadline; // timestamp by which video must be submitted
        uint256 totalDeposited;
        uint256 totalPaid;
        uint256 lastVerifiedViews; // latest FDC-verified view count (updated by keeper)
    }

    // ─── FDC Response DTOs ──────────────────────────────────

    struct ViewCountDTO {
        string videoId;
        uint256 viewCount;
    }

    struct EtagDTO {
        string videoId;
        string etag;
    }

    // ─── State ──────────────────────────────────────────────

    uint256 public nextDealId;
    mapping(uint256 => Deal) public deals;
    mapping(uint256 => MilestoneConfig[]) public milestones;
    mapping(uint256 => LinearConfig) public linearConfigs;

    // ─── Events ─────────────────────────────────────────────

    event OrderCreated(uint256 indexed dealId, address indexed client, PaymentMode paymentMode);
    event CreatorAccepted(uint256 indexed dealId, address indexed creator);
    event VideoSubmitted(uint256 indexed dealId, string videoId);
    event VideoApproved(uint256 indexed dealId, uint256 totalDeposited);
    event ViewsUpdated(uint256 indexed dealId, uint256 viewCount);
    event MilestoneClaimed(uint256 indexed dealId, uint256 milestoneIndex, uint256 payout, uint256 viewCount);
    event LinearClaimed(uint256 indexed dealId, uint256 payout, uint256 viewCount);
    event TamperingReported(uint256 indexed dealId, uint256 fundsReturned);
    event ExpiredClaimed(uint256 indexed dealId, uint256 milestoneIndex, uint256 fundsReturned);
    event DealCompleted(uint256 indexed dealId);

    // ─── Errors ─────────────────────────────────────────────

    error OnlyClient();
    error OnlyCreator();
    error InvalidStatus();
    error InvalidProof();
    error MilestoneAlreadyPaid();
    error MilestoneNotReached();
    error DeadlineNotExpired();
    error VideoDeadlineExpired();
    error NoPaymentDue();
    error VideoIdMismatch();
    error EtagNotChanged();

    // ─── Modifiers ──────────────────────────────────────────

    modifier onlyClient(uint256 dealId) {
        if (msg.sender != deals[dealId].client) revert OnlyClient();
        _;
    }

    modifier onlyCreator(uint256 dealId) {
        if (msg.sender != deals[dealId].creator) revert OnlyCreator();
        _;
    }

    modifier inStatus(uint256 dealId, DealStatus expected) {
        if (deals[dealId].status != expected) revert InvalidStatus();
        _;
    }

    // ─── Deal Lifecycle ─────────────────────────────────────

    /// @notice Client creates a milestone-based order
    /// @param stablecoin ERC20 token address for payments
    /// @param videoDeadlineDays Days creator has to submit video after acceptance
    /// @param viewTargets Array of view count targets for each milestone
    /// @param payoutAmounts Array of payout amounts for each milestone
    /// @param deadlineDurations Array of deadline durations (seconds) for each milestone after activation
    function createMilestoneOrder(
        address stablecoin,
        uint256 videoDeadlineDays,
        uint256[] calldata viewTargets,
        uint256[] calldata payoutAmounts,
        uint256[] calldata deadlineDurations
    ) external returns (uint256 dealId) {
        require(
            viewTargets.length == payoutAmounts.length && viewTargets.length == deadlineDurations.length,
            "Array length mismatch"
        );
        require(viewTargets.length > 0, "Need at least one milestone");

        dealId = nextDealId++;
        Deal storage deal = deals[dealId];
        deal.id = dealId;
        deal.client = msg.sender;
        deal.stablecoin = stablecoin;
        deal.paymentMode = PaymentMode.Milestone;
        deal.status = DealStatus.Open;
        deal.videoDeadline = videoDeadlineDays * 1 days;

        for (uint256 i = 0; i < viewTargets.length; i++) {
            milestones[dealId].push(
                MilestoneConfig({
                    viewTarget: viewTargets[i],
                    payoutAmount: payoutAmounts[i],
                    deadlineDuration: deadlineDurations[i],
                    deadlineTimestamp: 0,
                    isPaid: false
                })
            );
        }

        emit OrderCreated(dealId, msg.sender, PaymentMode.Milestone);
    }

    /// @notice Client creates a linear payment order
    function createLinearOrder(
        address stablecoin,
        uint256 videoDeadlineDays,
        uint256 ratePerView,
        uint256 totalCap
    ) external returns (uint256 dealId) {
        dealId = nextDealId++;
        Deal storage deal = deals[dealId];
        deal.id = dealId;
        deal.client = msg.sender;
        deal.stablecoin = stablecoin;
        deal.paymentMode = PaymentMode.Linear;
        deal.status = DealStatus.Open;
        deal.videoDeadline = videoDeadlineDays * 1 days;

        linearConfigs[dealId] = LinearConfig({ ratePerView: ratePerView, totalCap: totalCap, lastClaimedViews: 0 });

        emit OrderCreated(dealId, msg.sender, PaymentMode.Linear);
    }

    /// @notice Client accepts a creator for the deal
    function acceptCreator(
        uint256 dealId,
        address creatorAddress
    ) external onlyClient(dealId) inStatus(dealId, DealStatus.Open) {
        Deal storage deal = deals[dealId];
        deal.creator = creatorAddress;
        deal.status = DealStatus.InProgress;
        deal.videoDeadline = block.timestamp + deal.videoDeadline; // convert duration to absolute timestamp

        emit CreatorAccepted(dealId, creatorAddress);
    }

    /// @notice Creator submits video for review
    function submitVideo(
        uint256 dealId,
        string calldata videoId,
        bytes32 etagHash
    ) external onlyCreator(dealId) inStatus(dealId, DealStatus.InProgress) {
        Deal storage deal = deals[dealId];
        if (block.timestamp > deal.videoDeadline) revert VideoDeadlineExpired();

        deal.youtubeVideoId = videoId;
        deal.etagHash = etagHash;
        deal.status = DealStatus.InReview;

        emit VideoSubmitted(dealId, videoId);
    }

    /// @notice Client approves video, deposits stablecoins, activates milestones
    function approveVideo(uint256 dealId) external onlyClient(dealId) inStatus(dealId, DealStatus.InReview) {
        Deal storage deal = deals[dealId];

        // Calculate total deposit needed
        uint256 totalNeeded;
        if (deal.paymentMode == PaymentMode.Milestone) {
            MilestoneConfig[] storage ms = milestones[dealId];
            for (uint256 i = 0; i < ms.length; i++) {
                totalNeeded += ms[i].payoutAmount;
                ms[i].deadlineTimestamp = block.timestamp + ms[i].deadlineDuration;
            }
        } else {
            totalNeeded = linearConfigs[dealId].totalCap;
        }

        // Transfer stablecoins from client to contract
        IERC20(deal.stablecoin).safeTransferFrom(msg.sender, address(this), totalNeeded);
        deal.totalDeposited = totalNeeded;
        deal.status = DealStatus.Active;

        emit VideoApproved(dealId, totalNeeded);
    }

    // ─── FDC Proof Verification ─────────────────────────────

    /// @dev Verifies a Web2Json proof via Flare's ContractRegistry
    function _verifyProof(IWeb2Json.Proof calldata proof) internal view returns (bool) {
        return ContractRegistry.getFdcVerification().verifyWeb2Json(proof);
    }

    /// @notice Keeper updates the verified view count via FDC proof (no payout)
    function updateViews(uint256 dealId, IWeb2Json.Proof calldata proof) external inStatus(dealId, DealStatus.Active) {
        Deal storage deal = deals[dealId];

        if (!_verifyProof(proof)) revert InvalidProof();

        ViewCountDTO memory dto = abi.decode(proof.data.responseBody.abiEncodedData, (ViewCountDTO));

        if (keccak256(bytes(dto.videoId)) != keccak256(bytes(deal.youtubeVideoId))) revert VideoIdMismatch();

        // Only update if view count increased
        if (dto.viewCount > deal.lastVerifiedViews) {
            deal.lastVerifiedViews = dto.viewCount;
            emit ViewsUpdated(dealId, dto.viewCount);
        }
    }

    /// @notice Creator claims a milestone payout (views must already be verified by keeper)
    function claimMilestone(
        uint256 dealId,
        uint256 milestoneIndex
    ) external onlyCreator(dealId) inStatus(dealId, DealStatus.Active) {
        Deal storage deal = deals[dealId];
        MilestoneConfig storage ms = milestones[dealId][milestoneIndex];

        if (ms.isPaid) revert MilestoneAlreadyPaid();
        if (deal.lastVerifiedViews < ms.viewTarget) revert MilestoneNotReached();

        ms.isPaid = true;
        deal.totalPaid += ms.payoutAmount;
        IERC20(deal.stablecoin).safeTransfer(deal.creator, ms.payoutAmount);

        emit MilestoneClaimed(dealId, milestoneIndex, ms.payoutAmount, deal.lastVerifiedViews);

        _checkCompletion(dealId);
    }

    /// @notice Creator claims linear payment (views must already be verified by keeper)
    function claimLinear(uint256 dealId) external onlyCreator(dealId) inStatus(dealId, DealStatus.Active) {
        Deal storage deal = deals[dealId];
        LinearConfig storage lc = linearConfigs[dealId];

        if (deal.lastVerifiedViews <= lc.lastClaimedViews) revert NoPaymentDue();

        uint256 newViews = deal.lastVerifiedViews - lc.lastClaimedViews;
        uint256 payment = newViews * lc.ratePerView;
        uint256 remainingCap = lc.totalCap - deal.totalPaid;

        if (payment > remainingCap) {
            payment = remainingCap;
        }

        lc.lastClaimedViews = deal.lastVerifiedViews;
        deal.totalPaid += payment;
        IERC20(deal.stablecoin).safeTransfer(deal.creator, payment);

        emit LinearClaimed(dealId, payment, deal.lastVerifiedViews);

        if (deal.totalPaid >= lc.totalCap) {
            deal.status = DealStatus.Completed;
            emit DealCompleted(dealId);
        }
    }

    /// @notice Report video tampering via FDC etag proof
    function reportTampering(
        uint256 dealId,
        IWeb2Json.Proof calldata proof
    ) external inStatus(dealId, DealStatus.Active) {
        Deal storage deal = deals[dealId];

        if (!_verifyProof(proof)) revert InvalidProof();

        EtagDTO memory dto = abi.decode(proof.data.responseBody.abiEncodedData, (EtagDTO));

        if (keccak256(bytes(dto.videoId)) != keccak256(bytes(deal.youtubeVideoId))) revert VideoIdMismatch();

        // Compare etag hash — if same, no tampering
        bytes32 currentEtagHash = keccak256(bytes(dto.etag));
        if (currentEtagHash == deal.etagHash) revert EtagNotChanged();

        // Tampering detected — return remaining funds to client
        uint256 remaining = deal.totalDeposited - deal.totalPaid;
        deal.status = DealStatus.Terminated;
        if (remaining > 0) {
            IERC20(deal.stablecoin).safeTransfer(deal.client, remaining);
        }

        emit TamperingReported(dealId, remaining);
    }

    /// @notice Client reclaims funds for expired milestones
    function claimExpired(
        uint256 dealId,
        uint256 milestoneIndex
    ) external onlyClient(dealId) inStatus(dealId, DealStatus.Active) {
        MilestoneConfig storage ms = milestones[dealId][milestoneIndex];
        Deal storage deal = deals[dealId];

        if (ms.isPaid) revert MilestoneAlreadyPaid();
        if (block.timestamp < ms.deadlineTimestamp) revert DeadlineNotExpired();

        ms.isPaid = true; // mark as resolved (funds returned, not paid to creator)
        IERC20(deal.stablecoin).safeTransfer(deal.client, ms.payoutAmount);

        emit ExpiredClaimed(dealId, milestoneIndex, ms.payoutAmount);

        _checkCompletion(dealId);
    }

    // ─── View Functions ─────────────────────────────────────

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    function getMilestones(uint256 dealId) external view returns (MilestoneConfig[] memory) {
        return milestones[dealId];
    }

    function getLinearConfig(uint256 dealId) external view returns (LinearConfig memory) {
        return linearConfigs[dealId];
    }

    function getMilestoneCount(uint256 dealId) external view returns (uint256) {
        return milestones[dealId].length;
    }

    // ─── Internal ───────────────────────────────────────────

    function _checkCompletion(uint256 dealId) internal {
        MilestoneConfig[] storage ms = milestones[dealId];
        for (uint256 i = 0; i < ms.length; i++) {
            if (!ms[i].isPaid) return;
        }
        deals[dealId].status = DealStatus.Completed;
        emit DealCompleted(dealId);
    }

    /// @dev ABI signature hack — forces the compiler to generate ABI entries for DTOs
    function abiSignatureHack(ViewCountDTO calldata, EtagDTO calldata) external pure {}
}
