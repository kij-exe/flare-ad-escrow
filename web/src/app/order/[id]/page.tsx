"use client";

import { useState, useEffect, useCallback } from "react";
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
import { useRole } from "@/context/RoleContext";
import { YouTubeUpload } from "@/components/YouTubeUpload";
import { updateVideoPrivacy } from "@/lib/youtube";
import {
    type DealApplication,
    getApplicationsForDeal,
    submitApplication,
    updateApplicationStatus,
    rejectRemainingApplications,
    getYouTubeToken,
} from "@/lib/applications";

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
    const { role } = useRole();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash: txHash,
    });

    const [creatorAddress, setCreatorAddress] = useState("");
    const [videoId, setVideoId] = useState("");
    const [etagHash, setEtagHash] = useState("");
    const [applicationMessage, setApplicationMessage] = useState("");
    const [applications, setApplications] = useState<DealApplication[]>([]);
    const [isSubmittingApp, setIsSubmittingApp] = useState(false);
    const [showManualInput, setShowManualInput] = useState(false);
    const [showManualVideoInput, setShowManualVideoInput] = useState(false);

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

    const fetchApplications = useCallback(() => {
        getApplicationsForDeal(dealId).then(setApplications).catch(() => {});
    }, [dealId]);

    useEffect(() => {
        fetchApplications();
    }, [fetchApplications]);

    // Refetch all data once tx is confirmed on-chain
    useEffect(() => {
        if (isConfirmed) {
            refetchDeal();
            refetchMilestones();
            fetchApplications();
        }
    }, [isConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const myApplication = applications.find(
        (a) => a.creator_address === address?.toLowerCase()
    );
    const pendingApplications = applications.filter(
        (a) => a.status === "pending"
    );

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

    const handleAcceptCreator = (appCreatorAddress?: string) => {
        const addrToUse = appCreatorAddress || creatorAddress;
        if (!addrToUse || !addrToUse.startsWith("0x")) {
            toast.error("Please enter a valid address");
            return;
        }
        writeContract(
            {
                address: TRUSTTUBE_ADDRESS as `0x${string}`,
                abi: TRUSTTUBE_ABI,
                functionName: "acceptCreator",
                args: [BigInt(dealId), addrToUse as `0x${string}`],
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

    const handleAcceptApplication = async (app: DealApplication) => {
        handleAcceptCreator(app.creator_address);
        try {
            await updateApplicationStatus(app.id, "accepted");
            await rejectRemainingApplications(dealId, app.id);
            fetchApplications();
        } catch {
            // On-chain tx is what matters; Supabase status is best-effort
        }
    };

    const handleRejectApplication = async (app: DealApplication) => {
        try {
            await updateApplicationStatus(app.id, "rejected");
            fetchApplications();
            toast.success("Application rejected");
        } catch {
            toast.error("Failed to reject application");
        }
    };

    const handleSubmitApplication = async () => {
        if (!address) return;
        setIsSubmittingApp(true);
        try {
            await submitApplication(dealId, address, applicationMessage);
            toast.success("Application submitted!");
            setApplicationMessage("");
            fetchApplications();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "";
            if (msg.includes("duplicate") || msg.includes("unique")) {
                toast.error("You have already applied to this order");
            } else {
                toast.error("Failed to submit application");
            }
        } finally {
            setIsSubmittingApp(false);
        }
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

        const etagBytes32 = keccak256(toHex(etagHash));

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
                    writeContract(
                        {
                            address: TRUSTTUBE_ADDRESS as `0x${string}`,
                            abi: TRUSTTUBE_ABI,
                            functionName: "approveVideo",
                            args: [BigInt(dealId)],
                        },
                        {
                            onSuccess: async () => {
                                toast.dismiss("video-approve");
                                toast.success(
                                    "Video approved and funds deposited!"
                                );
                                refetchAll();
                                // Make the video public using the stored creator token
                                try {
                                    const token = await getYouTubeToken(dealId);
                                    if (token && deal.youtubeVideoId) {
                                        await updateVideoPrivacy(
                                            token,
                                            deal.youtubeVideoId,
                                            "public"
                                        );
                                        toast.success(
                                            "Video is now public!"
                                        );
                                    }
                                } catch {
                                    // Best-effort — token may have expired
                                }
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

                    {/* Open + Client role: Application List + Manual Fallback */}
                    {status === 0 && role === "client" && (
                        <div className="space-y-4">
                            {pendingApplications.length > 0 ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-zinc-400">
                                        Review applications from creators who want to work on this order.
                                    </p>
                                    {pendingApplications.map((app) => (
                                        <div
                                            key={app.id}
                                            className="flex items-start justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="font-mono text-xs text-zinc-300 break-all">
                                                    {app.creator_address}
                                                </p>
                                                {app.message && (
                                                    <p className="mt-1.5 text-sm text-zinc-400">
                                                        {app.message}
                                                    </p>
                                                )}
                                                <p className="mt-1 text-xs text-zinc-600">
                                                    {new Date(app.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <div className="ml-4 flex gap-2 shrink-0">
                                                <button
                                                    onClick={() => handleAcceptApplication(app)}
                                                    disabled={isBusy}
                                                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    onClick={() => handleRejectApplication(app)}
                                                    className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-zinc-400">
                                    No applications yet. Share this order with creators!
                                </p>
                            )}

                        </div>
                    )}

                    {/* Open + Creator role: Apply */}
                    {status === 0 && role === "creator" && (
                        <div className="space-y-3">
                            {myApplication ? (
                                <div className="rounded-lg bg-blue-900/10 border border-blue-800/50 p-4">
                                    <p className="text-sm font-medium text-blue-300">
                                        Application Submitted
                                    </p>
                                    {myApplication.message && (
                                        <p className="mt-1.5 text-sm text-zinc-400">
                                            Your message: {myApplication.message}
                                        </p>
                                    )}
                                    <p className="mt-1 text-xs text-zinc-500">
                                        Status: {myApplication.status} &middot; Submitted{" "}
                                        {new Date(myApplication.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-zinc-400">
                                        Interested in this sponsorship? Submit an application to the client.
                                    </p>
                                    <textarea
                                        value={applicationMessage}
                                        onChange={(e) => setApplicationMessage(e.target.value)}
                                        placeholder="Optional message to the client (e.g. your channel name, audience size, why you're a good fit)"
                                        rows={3}
                                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                                    />
                                    <button
                                        onClick={handleSubmitApplication}
                                        disabled={isSubmittingApp}
                                        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmittingApp
                                            ? "Submitting..."
                                            : "Apply for this Job"}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* InProgress + Creator role: Upload & Submit Video */}
                    {status === 1 && role === "creator" && (
                        <div className="space-y-4">
                            <p className="text-sm text-zinc-400">
                                Upload your video to YouTube and submit it for
                                the client to review. It will be published as
                                unlisted until the client approves.
                            </p>

                            {/* YouTube Upload (primary) */}
                            {!videoId && (
                                <YouTubeUpload
                                    dealId={dealId}
                                    onUploadComplete={(vid, etag) => {
                                        setVideoId(vid);
                                        setEtagHash(etag);
                                    }}
                                />
                            )}

                            {/* Upload result */}
                            {videoId && etagHash && !showManualVideoInput && (
                                <div className="rounded-lg bg-emerald-900/10 border border-emerald-800/50 p-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <svg
                                            className="h-4 w-4 text-emerald-400"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={2}
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                        <p className="text-sm font-medium text-emerald-300">
                                            Video Ready
                                        </p>
                                    </div>
                                    <p className="text-xs text-zinc-400">
                                        Video ID:{" "}
                                        <span className="font-mono text-zinc-300">
                                            {videoId}
                                        </span>
                                    </p>
                                </div>
                            )}

                            {/* Manual fallback */}
                            {!videoId && (
                                <div className="border-t border-zinc-800 pt-3">
                                    <button
                                        onClick={() =>
                                            setShowManualVideoInput(
                                                !showManualVideoInput
                                            )
                                        }
                                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        {showManualVideoInput
                                            ? "Hide manual input"
                                            : "Or enter video details manually"}
                                    </button>
                                    {showManualVideoInput && (
                                        <div className="mt-3 space-y-3">
                                            <input
                                                type="text"
                                                value={videoId}
                                                onChange={(e) =>
                                                    setVideoId(e.target.value)
                                                }
                                                placeholder="YouTube Video ID (e.g. dQw4w9WgXcQ)"
                                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <input
                                                type="text"
                                                value={etagHash}
                                                onChange={(e) =>
                                                    setEtagHash(e.target.value)
                                                }
                                                placeholder="Video Etag (from YouTube API)"
                                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Submit to contract */}
                            {videoId && etagHash && (
                                <button
                                    onClick={handleSubmitVideo}
                                    disabled={isBusy}
                                    className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isBusy
                                        ? "Processing..."
                                        : "Submit Video to Contract"}
                                </button>
                            )}
                        </div>
                    )}

                    {/* InProgress + Client role: Waiting for creator */}
                    {status === 1 && role === "client" && (
                        <div className="space-y-3">
                            <div className="rounded-lg bg-blue-900/10 border border-blue-800/50 p-4">
                                <p className="text-sm font-medium text-blue-300">
                                    Waiting for Creator to Submit Video
                                </p>
                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-zinc-500">Creator</span>
                                        <span className="font-mono text-xs text-zinc-300">
                                            {deal.creator.slice(0, 6)}...{deal.creator.slice(-4)}
                                        </span>
                                    </div>
                                    {deal.videoDeadline > 0n && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-zinc-500">Deadline</span>
                                            <span className="text-zinc-300">
                                                {new Date(Number(deal.videoDeadline) * 1000).toLocaleDateString()}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <p className="mt-3 text-xs text-zinc-500">
                                    The creator needs to upload their YouTube video and submit it for your review.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* InReview + Client role: Approve Video */}
                    {status === 2 && role === "client" && (
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

                    {/* InReview + Creator role: Waiting for client */}
                    {status === 2 && role === "creator" && (
                        <div className="rounded-lg bg-amber-900/10 border border-amber-800/50 p-4">
                            <p className="text-sm font-medium text-amber-300">
                                Video Under Review
                            </p>
                            <p className="mt-1.5 text-xs text-zinc-500">
                                The client is reviewing your submitted video. You&apos;ll be notified once they approve and deposit funds into escrow.
                            </p>
                        </div>
                    )}

                    {/* Active + Creator role: Claim earnings */}
                    {status === 3 && role === "creator" && (
                        <div className="space-y-4">
                            <p className="text-sm text-zinc-400">
                                View counts are verified on-chain every 5 minutes via Flare&apos;s FDC protocol. Claim your earnings when ready.
                            </p>

                            {/* Verified views */}
                            <div className="rounded-lg bg-zinc-800/50 p-4">
                                <span className="text-xs text-zinc-500">Verified Views</span>
                                <p className="mt-1 text-2xl font-bold text-zinc-100">
                                    {Number(deal.lastVerifiedViews).toLocaleString()}
                                </p>
                            </div>

                            {/* Milestone claim buttons */}
                            {paymentMode === 0 && milestones && (
                                <div className="space-y-2">
                                    {(milestones as readonly { viewTarget: bigint; payoutAmount: bigint; isPaid: boolean }[]).map((ms, i) => {
                                        const reached = deal.lastVerifiedViews >= ms.viewTarget;
                                        if (ms.isPaid) return null;
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    writeContract({
                                                        address: TRUSTTUBE_ADDRESS as `0x${string}`,
                                                        abi: TRUSTTUBE_ABI,
                                                        functionName: "claimMilestone",
                                                        args: [BigInt(dealId), BigInt(i)],
                                                    }, {
                                                        onSuccess: () => {
                                                            toast.success(`Milestone ${i + 1} claimed!`);
                                                            refetchAll();
                                                        },
                                                        onError: (error) => {
                                                            toast.error(error.message.includes("User rejected") ? "Transaction rejected" : "Milestone not reached yet");
                                                        },
                                                    });
                                                }}
                                                disabled={isBusy || !reached}
                                                className={`w-full rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                                    reached ? "bg-emerald-600 hover:bg-emerald-500" : "bg-zinc-700"
                                                }`}
                                            >
                                                {reached
                                                    ? `Claim Milestone ${i + 1} — ${formatUnits(ms.payoutAmount, 6)} USDC`
                                                    : `Milestone ${i + 1}: ${Number(deal.lastVerifiedViews).toLocaleString()} / ${Number(ms.viewTarget).toLocaleString()} views`
                                                }
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Linear claim button */}
                            {paymentMode === 1 && linearConfig && (() => {
                                const lc = linearConfig as { ratePerView: bigint; totalCap: bigint; lastClaimedViews: bigint };
                                const newViews = deal.lastVerifiedViews > lc.lastClaimedViews
                                    ? deal.lastVerifiedViews - lc.lastClaimedViews
                                    : 0n;
                                const claimable = newViews * lc.ratePerView;
                                const remaining = lc.totalCap - deal.totalPaid;
                                const amount = claimable > remaining ? remaining : claimable;

                                return (
                                    <button
                                        onClick={() => {
                                            writeContract({
                                                address: TRUSTTUBE_ADDRESS as `0x${string}`,
                                                abi: TRUSTTUBE_ABI,
                                                functionName: "claimLinear",
                                                args: [BigInt(dealId)],
                                            }, {
                                                onSuccess: () => {
                                                    toast.success("Earnings claimed!");
                                                    refetchAll();
                                                },
                                                onError: (error) => {
                                                    toast.error(error.message.includes("User rejected") ? "Transaction rejected" : "No new earnings to claim");
                                                },
                                            });
                                        }}
                                        disabled={isBusy || amount === 0n}
                                        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {amount > 0n
                                            ? `Claim ${formatUnits(amount, 6)} USDC (${Number(newViews).toLocaleString()} new views)`
                                            : "No new earnings to claim"
                                        }
                                    </button>
                                );
                            })()}
                        </div>
                    )}

                    {/* Active + Client role: Monitoring info */}
                    {status === 3 && role === "client" && (
                        <div className="space-y-3">
                            <p className="text-sm text-zinc-400">
                                This deal is active. View counts are verified on-chain every 5 minutes via Flare&apos;s FDC protocol.
                            </p>
                            <div className="rounded-lg bg-zinc-800/50 p-4">
                                <span className="text-xs text-zinc-500">Verified Views</span>
                                <p className="mt-1 text-2xl font-bold text-zinc-100">
                                    {Number(deal.lastVerifiedViews).toLocaleString()}
                                </p>
                            </div>
                        </div>
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

                    {/* Not connected to right role — only show for non-Open, non-terminal deals */}
                    {!isClient && !isCreator && status > 0 && status < 4 && (
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
