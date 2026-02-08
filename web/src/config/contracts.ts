export const TRUSTTUBE_ADDRESS = process.env.NEXT_PUBLIC_TRUSTTUBE_ADDRESS || ("0x" as `0x${string}`);
export const MOCK_USDC_ADDRESS = process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS || ("0x" as `0x${string}`);

// Only include the functions/events we actually use in the frontend
export const TRUSTTUBE_ABI = [
    {
        inputs: [
            { internalType: "address", name: "stablecoin", type: "address" },
            { internalType: "uint256", name: "videoDeadlineDays", type: "uint256" },
            { internalType: "uint256[]", name: "viewTargets", type: "uint256[]" },
            { internalType: "uint256[]", name: "payoutAmounts", type: "uint256[]" },
            { internalType: "uint256[]", name: "deadlineDurations", type: "uint256[]" },
        ],
        name: "createMilestoneOrder",
        outputs: [{ internalType: "uint256", name: "dealId", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { internalType: "address", name: "stablecoin", type: "address" },
            { internalType: "uint256", name: "videoDeadlineDays", type: "uint256" },
            { internalType: "uint256", name: "ratePerView", type: "uint256" },
            { internalType: "uint256", name: "totalCap", type: "uint256" },
        ],
        name: "createLinearOrder",
        outputs: [{ internalType: "uint256", name: "dealId", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { internalType: "uint256", name: "dealId", type: "uint256" },
            { internalType: "address", name: "creatorAddress", type: "address" },
        ],
        name: "acceptCreator",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { internalType: "uint256", name: "dealId", type: "uint256" },
            { internalType: "string", name: "videoId", type: "string" },
            { internalType: "bytes32", name: "etagHash", type: "bytes32" },
        ],
        name: "submitVideo",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "dealId", type: "uint256" }],
        name: "approveVideo",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { internalType: "uint256", name: "dealId", type: "uint256" },
            { internalType: "uint256", name: "milestoneIndex", type: "uint256" },
        ],
        name: "claimExpired",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { internalType: "uint256", name: "dealId", type: "uint256" },
            { internalType: "uint256", name: "milestoneIndex", type: "uint256" },
        ],
        name: "claimMilestone",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "dealId", type: "uint256" }],
        name: "claimLinear",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "dealId", type: "uint256" }],
        name: "getDeal",
        outputs: [
            {
                components: [
                    { internalType: "uint256", name: "id", type: "uint256" },
                    { internalType: "address", name: "client", type: "address" },
                    { internalType: "address", name: "creator", type: "address" },
                    { internalType: "address", name: "stablecoin", type: "address" },
                    { internalType: "enum TrustTube.PaymentMode", name: "paymentMode", type: "uint8" },
                    { internalType: "enum TrustTube.DealStatus", name: "status", type: "uint8" },
                    { internalType: "string", name: "youtubeVideoId", type: "string" },
                    { internalType: "bytes32", name: "etagHash", type: "bytes32" },
                    { internalType: "uint256", name: "videoDeadline", type: "uint256" },
                    { internalType: "uint256", name: "totalDeposited", type: "uint256" },
                    { internalType: "uint256", name: "totalPaid", type: "uint256" },
                    { internalType: "uint256", name: "lastVerifiedViews", type: "uint256" },
                ],
                internalType: "struct TrustTube.Deal",
                name: "",
                type: "tuple",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "dealId", type: "uint256" }],
        name: "getMilestones",
        outputs: [
            {
                components: [
                    { internalType: "uint256", name: "viewTarget", type: "uint256" },
                    { internalType: "uint256", name: "payoutAmount", type: "uint256" },
                    { internalType: "uint256", name: "deadlineDuration", type: "uint256" },
                    { internalType: "uint256", name: "deadlineTimestamp", type: "uint256" },
                    { internalType: "bool", name: "isPaid", type: "bool" },
                ],
                internalType: "struct TrustTube.MilestoneConfig[]",
                name: "",
                type: "tuple[]",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "dealId", type: "uint256" }],
        name: "getLinearConfig",
        outputs: [
            {
                components: [
                    { internalType: "uint256", name: "ratePerView", type: "uint256" },
                    { internalType: "uint256", name: "totalCap", type: "uint256" },
                    { internalType: "uint256", name: "lastClaimedViews", type: "uint256" },
                ],
                internalType: "struct TrustTube.LinearConfig",
                name: "",
                type: "tuple",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "dealId", type: "uint256" }],
        name: "getMilestoneCount",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "nextDealId",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    // Events
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "dealId", type: "uint256" },
            { indexed: true, internalType: "address", name: "client", type: "address" },
            { indexed: false, internalType: "enum TrustTube.PaymentMode", name: "paymentMode", type: "uint8" },
        ],
        name: "OrderCreated",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "dealId", type: "uint256" },
            { indexed: true, internalType: "address", name: "creator", type: "address" },
        ],
        name: "CreatorAccepted",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "dealId", type: "uint256" },
            { indexed: false, internalType: "string", name: "videoId", type: "string" },
        ],
        name: "VideoSubmitted",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "dealId", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "totalDeposited", type: "uint256" },
        ],
        name: "VideoApproved",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "dealId", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "milestoneIndex", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "payout", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "viewCount", type: "uint256" },
        ],
        name: "MilestoneClaimed",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "dealId", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "payout", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "viewCount", type: "uint256" },
        ],
        name: "LinearClaimed",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "dealId", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "fundsReturned", type: "uint256" },
        ],
        name: "TamperingReported",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "dealId", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "milestoneIndex", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "fundsReturned", type: "uint256" },
        ],
        name: "ExpiredClaimed",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [{ indexed: true, internalType: "uint256", name: "dealId", type: "uint256" }],
        name: "DealCompleted",
        type: "event",
    },
] as const;

export const MOCK_USDC_ABI = [
    {
        inputs: [
            { internalType: "address", name: "spender", type: "address" },
            { internalType: "uint256", name: "value", type: "uint256" },
        ],
        name: "approve",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "address", name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "decimals",
        outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
        stateMutability: "pure",
        type: "function",
    },
    {
        inputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "amount", type: "uint256" },
        ],
        name: "mint",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { internalType: "address", name: "owner", type: "address" },
            { internalType: "address", name: "spender", type: "address" },
        ],
        name: "allowance",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "name",
        outputs: [{ internalType: "string", name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "symbol",
        outputs: [{ internalType: "string", name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
    },
] as const;
