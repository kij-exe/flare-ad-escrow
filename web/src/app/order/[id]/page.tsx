"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
    useAccount,
    useReadContract,
    useWriteContract,
    useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, keccak256, toHex } from "viem";
import {
    TRUSTTUBE_ABI,
    TRUSTTUBE_ADDRESS,
    MOCK_USDC_ABI,
    MOCK_USDC_ADDRESS,
} from "@/config/contracts";
import toast from "react-hot-toast";
import Link from "next/link";

const STATUS_LABELS = [
    "Open",
    "In Progress",
    "In Review",
    "Active",
    "Completed",
    "Terminated",
];
const MODE_LABELS = ["Milestone", "Linear"];

const STATUS_COLORS: Record<number, string> = {
    0: "bg-emerald-900/50 text-emerald-300 border border-emerald-800",
    1: "bg-blue-900/50 text-blue-300 border border-blue-800",
    2: "bg-amber-900/50 text-amber-300 border border-amber-800",
    3: "bg-violet-900/50 text-violet-300 border border-violet-800",
    4: "bg-zinc-800 text-zinc-400 border border-zinc-700",
    5: "bg-red-900/50 text-red-300 border border-red-800",
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export default function OrderDetail() {
    const params = useParams();
    const dealId = Number(params.id);
    const { address } = useAccount();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming } = useWaitForTransactionReceipt({
        hash: txHash,
    });

    const [creatorAddress, setCreatorAddress] = useState("");
    const [videoId, setVideoId] = useState("");
    const [etagHash, setEtagHash] = useState("");

    const { data: deal, refetch: refetchDeal } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "getDeal",
        args: [BigInt(dealId)],
    });

    const { data: milestones, refetch: refetchMilestones } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "getMilestones",
        args: [BigInt(dealId)],
    });

    const { data: linearConfig } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "getLinearConfig",
        args: [BigInt(dealId)],
    });

    if (!deal) {
        return (
            <div className="mx-auto max-w-3xl">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 w-48 rounded bg-zinc-800" />
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
                        <div className="h-6 w-64 rounded bg-zinc-800" />
                        <div className="h-4 w-48 rounded bg-zinc-800" />
                        <div className="h-4 w-56 rounded bg-zinc-800" />
                    </div>
                </div>
            </div>
        );
    }

    const status = Number(deal.status);
    const paymentMode = Number(deal.paymentMode);
    const isClient =
        address?.toLowerCase() === deal.client.toLowerCase();
    const isCreator =
        address?.toLowerCase() === deal.creator.toLowerCase() &&
        deal.creator !== ZERO_ADDRESS;

    const refetchAll = () => {
        refetchDeal();
        refetchMilestones();
    };

    // Calculate total payout
    let totalPayout = 0n;
    if (paymentMode === 0 && milestones) {
        totalPayout = (milestones as readonly { payoutAmount: bigint }[]).reduce(
            (sum, m) => sum + m.payoutAmount,
            0n
        );
    } else if (paymentMode === 1 && linearConfig) {
        totalPayout = (linearConfig as { totalCap: bigint }).totalCap;
    }

    const handleAcceptCreator = () => {
        if (!creatorAddress || !creatorAddress.startsWith("0x")) {
            toast.error("Please enter a valid address");
            return;
        }
        console.log("Accepting creator:", { dealId, creatorAddress });
        writeContract(
            {
                address: TRUSTTUBE_ADDRESS as `0x${string}`,
                abi: TRUSTTUBE_ABI,
                functionName: "acceptCreator",
                args: [BigInt(dealId), creatorAddress as `0x${string}`],
            },
            {
                onSuccess: () => {
                    toast.success("Creator accepted!");
                    refetchAll();
                },
                onError: (error) => {
                    console.error("acceptCreator error:", error);
                    toast.error(
                        error.message.includes("User rejected")
                            ? "Transaction rejected"
                            : "Failed to accept creator"
                    );
                },
            }
        );
    };

    const handleSubmitVideo = () => {
        if (!videoId) {
            toast.error("Please enter a YouTube video ID");
            return;
        }
        if (!etagHash) {
            toast.error("Please enter the video etag");
            return;
        }

        // Hash the etag string to bytes32 (same as contract expects)
        const etagBytes32 = keccak256(toHex(etagHash));
        console.log("Submitting video:", { dealId, videoId, etag: etagHash, etagBytes32 });

        writeContract(
            {
                address: TRUSTTUBE_ADDRESS as `0x${string}`,
                abi: TRUSTTUBE_ABI,
                functionName: "submitVideo",
                args: [BigInt(dealId), videoId, etagBytes32],
            },
            {
                onSuccess: () => {
                    toast.success("Video submitted for review!");
                    refetchAll();
                },
                onError: (error) => {
                    console.error("submitVideo error:", error);
                    toast.error(
                        error.message.includes("User rejected")
                            ? "Transaction rejected"
                            : "Failed to submit video"
                    );
                },
            }
        );
    };

    const handleApproveVideo = async () => {
        // First approve USDC spending
        const approveAmount = totalPayout;
        toast.loading("Step 1/2: Approving USDC...", { id: "approve" });

        writeContract(
            {
                address: MOCK_USDC_ADDRESS as `0x${string}`,
                abi: MOCK_USDC_ABI,
                functionName: "approve",
                args: [TRUSTTUBE_ADDRESS as `0x${string}`, approveAmount],
            },
            {
                onSuccess: () => {
                    toast.dismiss("approve");
                    toast.loading("Step 2/2: Approving video...", {
                        id: "video-approve",
                    });
                    // Now approve the video
                    writeContract(
                        {
                            address: TRUSTTUBE_ADDRESS as `0x${string}`,
                            abi: TRUSTTUBE_ABI,
                            functionName: "approveVideo",
                            args: [BigInt(dealId)],
                        },
                        {
                            onSuccess: () => {
                                toast.dismiss("video-approve");
                                toast.success(
                                    "Video approved and funds deposited!"
                                );
                                refetchAll();
                            },
                            onError: (error) => {
                                toast.dismiss("video-approve");
                                toast.error(
                                    error.message.includes("User rejected")
                                        ? "Transaction rejected"
                                        : "Failed to approve video"
                                );
                            },
                        }
                    );
                },
                onError: (error) => {
                    toast.dismiss("approve");
                    toast.error(
                        error.message.includes("User rejected")
                            ? "Transaction rejected"
                            : "Failed to approve USDC"
                    );
                },
            }
        );
    };

    const handleClaimExpired = (milestoneIndex: number) => {
        writeContract(
            {
                address: TRUSTTUBE_ADDRESS as `0x${string}`,
                abi: TRUSTTUBE_ABI,
                functionName: "claimExpired",
                args: [BigInt(dealId), BigInt(milestoneIndex)],
            },
            {
                onSuccess: () => {
                    toast.success(
                        `Expired milestone ${milestoneIndex + 1} funds reclaimed!`
                    );
                    refetchAll();
                },
                onError: (error) => {
                    toast.error(
                        error.message.includes("User rejected")
                            ? "Transaction rejected"
                            : "Failed to claim expired milestone"
                    );
                },
            }
        );
    };

    const isBusy = isPending || isConfirming;

    return (
        <div className="mx-auto max-w-3xl">
            {/* Back link */}
            <Link
                href="/marketplace"
                className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
                <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                    />
                </svg>
                Back to Marketplace
            </Link>

            {/* Header */}
            <div className="mb-8 flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50">
                        Order #{dealId}
                    </h1>
                    <p className="mt-1 text-zinc-400">
                        {MODE_LABELS[paymentMode]} payment deal
                    </p>
                </div>
                <span
                    className={`px-4 py-1.5 rounded-full text-sm font-medium ${STATUS_COLORS[status]}`}
                >
                    {STATUS_LABELS[status]}
                </span>
            </div>

            {/* Deal Info */}
            <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <h2 className="mb-4 text-lg font-semibold text-zinc-100">
                    Deal Information
                </h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-zinc-500">Client</span>
                        <p className="mt-1 font-mono text-xs text-zinc-300 break-all">
                            {deal.client}
                        </p>
                    </div>
                    <div>
                        <span className="text-zinc-500">Creator</span>
                        <p className="mt-1 font-mono text-xs text-zinc-300 break-all">
                            {deal.creator === ZERO_ADDRESS
                                ? "Not assigned yet"
                                : deal.creator}
                        </p>
                    </div>
                    <div>
                        <span className="text-zinc-500">Payment Mode</span>
                        <p className="mt-1 text-zinc-300">
                            {MODE_LABELS[paymentMode]}
                        </p>
                    </div>
                    <div>
                        <span className="text-zinc-500">Total Budget</span>
                        <p className="mt-1 font-semibold text-zinc-100">
                            {formatUnits(totalPayout, 6)} USDC
                        </p>
                    </div>
                    {deal.youtubeVideoId && (
                        <div>
                            <span className="text-zinc-500">
                                YouTube Video ID
                            </span>
                            <p className="mt-1 text-zinc-300">
                                <a
                                    href={`https://youtube.com/watch?v=${deal.youtubeVideoId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    {deal.youtubeVideoId}
                                </a>
                            </p>
                        </div>
                    )}
                    {deal.videoDeadline > 0n && (
                        <div>
                            <span className="text-zinc-500">
                                Video Deadline
                            </span>
                            <p className="mt-1 text-zinc-300">
                                {status === 0
                                    ? `${Number(deal.videoDeadline) / 86400} days after acceptance`
                                    : new Date(
                                          Number(deal.videoDeadline) * 1000
                                      ).toLocaleDateString()}
                            </p>
                        </div>
                    )}
                    {deal.totalDeposited > 0n && (
                        <>
                            <div>
                                <span className="text-zinc-500">
                                    Deposited
                                </span>
                                <p className="mt-1 text-zinc-300">
                                    {formatUnits(deal.totalDeposited, 6)} USDC
                                </p>
                            </div>
                            <div>
                                <span className="text-zinc-500">
                                    Paid Out
                                </span>
                                <p className="mt-1 text-zinc-300">
                                    {formatUnits(deal.totalPaid, 6)} USDC
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Your role indicator */}
                {address && (isClient || isCreator) && (
                    <div className="mt-4 rounded-lg bg-zinc-800/50 px-4 py-2">
                        <span className="text-xs text-zinc-500">
                            Your role:{" "}
                        </span>
                        <span className="text-xs font-medium text-blue-400">
                            {isClient ? "Client" : "Creator"}
                        </span>
                    </div>
                )}
            </div>

            {/* Milestones */}
            {paymentMode === 0 && milestones && (milestones as readonly unknown[]).length > 0 && (
                <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                    <h2 className="mb-4 text-lg font-semibold text-zinc-100">
                        Milestones
                    </h2>
                    <div className="space-y-3">
                        {(
                            milestones as readonly {
                                viewTarget: bigint;
                                payoutAmount: bigint;
                                deadlineDuration: bigint;
                                deadlineTimestamp: bigint;
                                isPaid: boolean;
                            }[]
                        ).map((ms, i) => {
                            const isExpired =
                                ms.deadlineTimestamp > 0n &&
                                Date.now() / 1000 >
                                    Number(ms.deadlineTimestamp);

                            return (
                                <div
                                    key={i}
                                    className={`flex items-center justify-between rounded-lg border p-4 ${
                                        ms.isPaid
                                            ? "border-emerald-800/50 bg-emerald-900/10"
                                            : isExpired
                                              ? "border-red-800/50 bg-red-900/10"
                                              : "border-zinc-700/50 bg-zinc-800/50"
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                                                ms.isPaid
                                                    ? "bg-emerald-900 text-emerald-300"
                                                    : isExpired
                                                      ? "bg-red-900 text-red-300"
                                                      : "bg-zinc-700 text-zinc-300"
                                            }`}
                                        >
                                            {ms.isPaid ? (
                                                <svg
                                                    className="h-4 w-4"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    strokeWidth={2}
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M4.5 12.75l6 6 9-13.5"
                                                    />
                                                </svg>
                                            ) : (
                                                i + 1
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-zinc-200">
                                                {Number(
                                                    ms.viewTarget
                                                ).toLocaleString()}{" "}
                                                views
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                {formatUnits(
                                                    ms.payoutAmount,
                                                    6
                                                )}{" "}
                                                USDC
                                                {ms.deadlineTimestamp > 0n && (
                                                    <>
                                                        {" "}
                                                        &middot; Deadline:{" "}
                                                        {new Date(
                                                            Number(
                                                                ms.deadlineTimestamp
                                                            ) * 1000
                                                        ).toLocaleDateString()}
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {ms.isPaid && (
                                            <span className="text-xs font-medium text-emerald-400">
                                                Resolved
                                            </span>
                                        )}
                                        {!ms.isPaid &&
                                            isExpired &&
                                            isClient &&
                                            status === 3 && (
                                                <button
                                                    onClick={() =>
                                                        handleClaimExpired(i)
                                                    }
                                                    disabled={isBusy}
                                                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                                                >
                                                    Reclaim
                                                </button>
                                            )}
                                        {!ms.isPaid && !isExpired && (
                                            <span className="text-xs text-zinc-500">
                                                Pending
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Linear Config */}
            {paymentMode === 1 && linearConfig && (
                <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                    <h2 className="mb-4 text-lg font-semibold text-zinc-100">
                        Linear Payment Configuration
                    </h2>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="rounded-lg bg-zinc-800/50 p-4">
                            <span className="text-xs text-zinc-500">
                                Rate per View
                            </span>
                            <p className="mt-1 text-lg font-semibold text-zinc-100">
                                {formatUnits(
                                    (linearConfig as { ratePerView: bigint })
                                        .ratePerView,
                                    6
                                )}{" "}
                                USDC
                            </p>
                        </div>
                        <div className="rounded-lg bg-zinc-800/50 p-4">
                            <span className="text-xs text-zinc-500">
                                Total Cap
                            </span>
                            <p className="mt-1 text-lg font-semibold text-zinc-100">
                                {formatUnits(
                                    (linearConfig as { totalCap: bigint })
                                        .totalCap,
                                    6
                                )}{" "}
                                USDC
                            </p>
                        </div>
                        <div className="rounded-lg bg-zinc-800/50 p-4">
                            <span className="text-xs text-zinc-500">
                                Views Claimed
                            </span>
                            <p className="mt-1 text-lg font-semibold text-zinc-100">
                                {Number(
                                    (
                                        linearConfig as {
                                            lastClaimedViews: bigint;
                                        }
                                    ).lastClaimedViews
                                ).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    {deal.totalDeposited > 0n && (
                        <div className="mt-4">
                            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                                <span>Payment progress</span>
                                <span>
                                    {formatUnits(deal.totalPaid, 6)} /{" "}
                                    {formatUnits(deal.totalDeposited, 6)} USDC
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-zinc-800">
                                <div
                                    className="h-2 rounded-full bg-blue-600 transition-all"
                                    style={{
                                        width: `${Math.min(100, (Number(deal.totalPaid) / Number(deal.totalDeposited)) * 100)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            {address && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                    <h2 className="mb-4 text-lg font-semibold text-zinc-100">
                        Actions
                    </h2>

                    {/* Open + Client: Accept Creator */}
                    {status === 0 && isClient && (
                        <div className="space-y-3">
                            <p className="text-sm text-zinc-400">
                                Enter a creator&apos;s wallet address to assign
                                them to this order.
                            </p>
                            <input
                                type="text"
                                value={creatorAddress}
                                onChange={(e) =>
                                    setCreatorAddress(e.target.value)
                                }
                                placeholder="0x... creator address"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 font-mono placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleAcceptCreator}
                                disabled={isBusy}
                                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isBusy
                                    ? "Processing..."
                                    : "Accept Creator"}
                            </button>
                        </div>
                    )}

                    {/* InProgress + Creator: Submit Video */}
                    {status === 1 && isCreator && (
                        <div className="space-y-3">
                            <p className="text-sm text-zinc-400">
                                Submit your YouTube video for the client to
                                review.
                            </p>
                            <input
                                type="text"
                                value={videoId}
                                onChange={(e) => setVideoId(e.target.value)}
                                placeholder="YouTube Video ID (e.g. dQw4w9WgXcQ)"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <input
                                type="text"
                                value={etagHash}
                                onChange={(e) => setEtagHash(e.target.value)}
                                placeholder="Video Etag (from YouTube API)"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleSubmitVideo}
                                disabled={isBusy}
                                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isBusy
                                    ? "Processing..."
                                    : "Submit Video"}
                            </button>
                        </div>
                    )}

                    {/* InReview + Client: Approve Video */}
                    {status === 2 && isClient && (
                        <div className="space-y-3">
                            <p className="text-sm text-zinc-400">
                                Review the submitted video. Approving will
                                deposit{" "}
                                <span className="font-semibold text-zinc-200">
                                    {formatUnits(totalPayout, 6)} USDC
                                </span>{" "}
                                into escrow.
                            </p>
                            {deal.youtubeVideoId && (
                                <a
                                    href={`https://youtube.com/watch?v=${deal.youtubeVideoId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-blue-400 hover:border-zinc-600 hover:bg-zinc-700 transition-all"
                                >
                                    <svg
                                        className="h-5 w-5"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                    </svg>
                                    Watch Video: {deal.youtubeVideoId}
                                </a>
                            )}
                            <button
                                onClick={handleApproveVideo}
                                disabled={isBusy}
                                className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isBusy
                                    ? "Processing..."
                                    : `Approve Video & Deposit ${formatUnits(totalPayout, 6)} USDC`}
                            </button>
                        </div>
                    )}

                    {/* Active status info */}
                    {status === 3 && !isClient && (
                        <p className="text-sm text-zinc-400">
                            This deal is active. View counts will be verified
                            on-chain via Flare&apos;s FDC protocol to unlock
                            milestone payments.
                        </p>
                    )}

                    {/* Completed / Terminated */}
                    {status === 4 && (
                        <div className="rounded-lg bg-emerald-900/10 border border-emerald-800/50 p-4">
                            <p className="text-sm text-emerald-300">
                                This deal has been completed. All milestones
                                have been resolved.
                            </p>
                        </div>
                    )}
                    {status === 5 && (
                        <div className="rounded-lg bg-red-900/10 border border-red-800/50 p-4">
                            <p className="text-sm text-red-300">
                                This deal was terminated due to video tampering.
                                Remaining funds were returned to the client.
                            </p>
                        </div>
                    )}

                    {/* Not connected to right role */}
                    {!isClient && !isCreator && status < 4 && (
                        <p className="text-sm text-zinc-500">
                            You are not a participant in this deal. Connect the
                            client or creator wallet to take actions.
                        </p>
                    )}
                </div>
            )}

            {!address && (
                <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center">
                    <p className="text-zinc-500">
                        Connect your wallet to interact with this order
                    </p>
                </div>
            )}
        </div>
    );
}
