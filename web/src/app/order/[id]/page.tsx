"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
    useAccount,
    useReadContract,
    useWriteContract,
    useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, keccak256, toHex } from "viem/utils";
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
    0: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    1: "bg-[#fff1f3] text-[#E62058] border border-[#ffccd5]",
    2: "bg-amber-50 text-amber-700 border border-amber-200",
    3: "bg-violet-50 text-violet-700 border border-violet-200",
    4: "bg-[#f6f6f6] text-[#777] border border-[#c4c4c4]",
    5: "bg-red-50 text-red-700 border border-red-200",
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

    const { data: deal, refetch: refetchDeal, error: dealError, isLoading: dealLoading } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "getDeal",
        args: [BigInt(dealId)],
    });

    console.log("[OrderDetail] dealId:", dealId, "deal:", deal, "error:", dealError, "loading:", dealLoading);

    const { data: milestones, refetch: refetchMilestones } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "getMilestones",
        args: [BigInt(dealId)],
    });

    const { data: linearConfig, refetch: refetchLinearConfig } = useReadContract({
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
            refetchAll();
            fetchApplications();
        }
    }, [isConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-refresh for Active deals (every 60s to avoid rate limits)
    const isActive = deal ? Number(deal.status) === 3 : false;
    useEffect(() => {
        if (!isActive) return;
        const interval = setInterval(() => {
            refetchAll();
        }, 60000);
        return () => clearInterval(interval);
    }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!deal) {
        return (
            <div className="mx-auto max-w-3xl">
                <div className="animate-pulse space-y-[1.6rem]">
                    <div className="h-[2rem] w-[12rem] rounded-[6px] bg-[#f6f6f6]" />
                    <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem] space-y-[1rem]">
                        <div className="h-[1.2rem] w-[16rem] rounded-[6px] bg-[#f6f6f6]" />
                        <div className="h-[0.8rem] w-[12rem] rounded-[6px] bg-[#f6f6f6]" />
                        <div className="h-[0.8rem] w-[14rem] rounded-[6px] bg-[#f6f6f6]" />
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
        refetchLinearConfig();
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
                className="mb-[1.6rem] inline-flex items-center gap-[0.4rem] text-[0.8rem] text-[#777] hover:text-[#232323] transition-colors duration-200"
            >
                <svg
                    className="h-[1rem] w-[1rem]"
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
            <div className="mb-[2rem] flex items-start justify-between">
                <div>
                    <h1 className="text-[2.4rem] leading-[2.7rem] font-bold text-[#232323]">
                        Order #{dealId}
                    </h1>
                    <p className="mt-[0.4rem] text-[0.8rem] text-[#777]">
                        {MODE_LABELS[paymentMode]} payment deal
                    </p>
                </div>
                <span
                    className={`px-[0.8rem] py-[0.3rem] rounded-full text-[0.7rem] font-bold ${STATUS_COLORS[status]}`}
                >
                    {STATUS_LABELS[status]}
                </span>
            </div>

            {/* Deal Info */}
            <div className="mb-[1.6rem] rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
                <h2 className="mb-[1.2rem] text-[1.2rem] font-bold text-[#232323]">
                    Deal Information
                </h2>
                <div className="grid grid-cols-2 gap-[1rem] text-[0.8rem]">
                    <div>
                        <span className="text-[#a0a0a0]">Client</span>
                        <p className="mt-[0.3rem] font-mono text-[0.7rem] text-[#232323] break-all">
                            {deal.client}
                        </p>
                    </div>
                    <div>
                        <span className="text-[#a0a0a0]">Creator</span>
                        <p className="mt-[0.3rem] font-mono text-[0.7rem] text-[#232323] break-all">
                            {deal.creator === ZERO_ADDRESS
                                ? "Not assigned yet"
                                : deal.creator}
                        </p>
                    </div>
                    <div>
                        <span className="text-[#a0a0a0]">Payment Mode</span>
                        <p className="mt-[0.3rem] text-[#232323]">
                            {MODE_LABELS[paymentMode]}
                        </p>
                    </div>
                    <div>
                        <span className="text-[#a0a0a0]">Total Budget</span>
                        <p className="mt-[0.3rem] font-bold text-[#232323]">
                            {formatUnits(totalPayout, 6)} USDC
                        </p>
                    </div>
                    {deal.youtubeVideoId && (
                        <div>
                            <span className="text-[#a0a0a0]">
                                YouTube Video ID
                            </span>
                            <p className="mt-[0.3rem] text-[#232323]">
                                <a
                                    href={`https://youtube.com/watch?v=${deal.youtubeVideoId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#E62058] hover:text-[#c10f45] transition-colors duration-200"
                                >
                                    {deal.youtubeVideoId}
                                </a>
                            </p>
                        </div>
                    )}
                    {deal.videoDeadline > 0n && (
                        <div>
                            <span className="text-[#a0a0a0]">
                                Video Deadline
                            </span>
                            <p className="mt-[0.3rem] text-[#232323]">
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
                                <span className="text-[#a0a0a0]">
                                    Deposited
                                </span>
                                <p className="mt-[0.3rem] text-[#232323]">
                                    {formatUnits(deal.totalDeposited, 6)} USDC
                                </p>
                            </div>
                            <div>
                                <span className="text-[#a0a0a0]">
                                    Paid Out
                                </span>
                                <p className="mt-[0.3rem] text-[#232323]">
                                    {formatUnits(deal.totalPaid, 6)} USDC
                                </p>
                            </div>
                        </>
                    )}
                </div>

            </div>

            {/* Milestones */}
            {paymentMode === 0 && milestones && (milestones as readonly unknown[]).length > 0 && (
                <div className="mb-[1.6rem] rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
                    <h2 className="mb-[1.2rem] text-[1.2rem] font-bold text-[#232323]">
                        Milestones
                    </h2>
                    <div className="space-y-[0.8rem]">
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
                                    className={`flex items-center justify-between rounded-[6px] border p-[1rem] ${
                                        ms.isPaid
                                            ? "border-emerald-200 bg-emerald-50"
                                            : isExpired
                                              ? "border-red-200 bg-red-50"
                                              : "border-[#c4c4c4] bg-[#f6f6f6]"
                                    }`}
                                >
                                    <div className="flex items-center gap-[1rem]">
                                        <div
                                            className={`flex h-[2rem] w-[2rem] items-center justify-center rounded-full text-[0.7rem] font-bold ${
                                                ms.isPaid
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : isExpired
                                                      ? "bg-red-100 text-red-700"
                                                      : "bg-[#c4c4c4] text-[#232323]"
                                            }`}
                                        >
                                            {ms.isPaid ? (
                                                <svg
                                                    className="h-[1rem] w-[1rem]"
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
                                            <p className="text-[0.8rem] font-medium text-[#232323]">
                                                {Number(
                                                    ms.viewTarget
                                                ).toLocaleString()}{" "}
                                                views
                                            </p>
                                            <p className="text-[0.7rem] text-[#a0a0a0]">
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
                                    <div className="flex items-center gap-[0.5rem]">
                                        {ms.isPaid && (
                                            <span className="text-[0.7rem] font-bold text-emerald-600">
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
                                                    className="rounded-[6px] bg-red-600 px-[0.8rem] py-[0.4rem] text-[0.7rem] font-bold text-white transition-colors duration-200 hover:bg-red-500 disabled:opacity-50"
                                                >
                                                    Reclaim
                                                </button>
                                            )}
                                        {!ms.isPaid && !isExpired && (
                                            <span className="text-[0.7rem] text-[#a0a0a0]">
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
                <div className="mb-[1.6rem] rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
                    <h2 className="mb-[1.2rem] text-[1.2rem] font-bold text-[#232323]">
                        Linear Payment Configuration
                    </h2>
                    <div className="grid grid-cols-3 gap-[1rem]">
                        <div className="rounded-[6px] bg-[#f6f6f6] p-[1rem]">
                            <span className="text-[0.7rem] text-[#a0a0a0]">
                                Rate per View
                            </span>
                            <p className="mt-[0.3rem] text-[1.2rem] font-bold text-[#232323]">
                                {formatUnits(
                                    (linearConfig as { ratePerView: bigint })
                                        .ratePerView,
                                    6
                                )}{" "}
                                USDC
                            </p>
                        </div>
                        <div className="rounded-[6px] bg-[#f6f6f6] p-[1rem]">
                            <span className="text-[0.7rem] text-[#a0a0a0]">
                                Total Cap
                            </span>
                            <p className="mt-[0.3rem] text-[1.2rem] font-bold text-[#232323]">
                                {formatUnits(
                                    (linearConfig as { totalCap: bigint })
                                        .totalCap,
                                    6
                                )}{" "}
                                USDC
                            </p>
                        </div>
                        <div className="rounded-[6px] bg-[#f6f6f6] p-[1rem]">
                            <span className="text-[0.7rem] text-[#a0a0a0]">
                                Views Claimed
                            </span>
                            <p className="mt-[0.3rem] text-[1.2rem] font-bold text-[#232323]">
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
                        <div className="mt-[1rem]">
                            <div className="flex items-center justify-between text-[0.7rem] text-[#a0a0a0] mb-[0.3rem]">
                                <span>Payment progress</span>
                                <span>
                                    {formatUnits(deal.totalPaid, 6)} /{" "}
                                    {formatUnits(deal.totalDeposited, 6)} USDC
                                </span>
                            </div>
                            <div className="h-[0.3rem] rounded-full bg-[#f6f6f6]">
                                <div
                                    className="h-[0.3rem] rounded-full bg-[#E62058] transition-all"
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
                <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
                    <h2 className="mb-[1.2rem] text-[1.2rem] font-bold text-[#232323]">
                        Actions
                    </h2>

                    {/* Open + Client role: Application List + Manual Fallback */}
                    {status === 0 && role === "client" && (
                        <div className="space-y-[1rem]">
                            {pendingApplications.length > 0 ? (
                                <div className="space-y-[0.8rem]">
                                    <p className="text-[0.8rem] text-[#777]">
                                        Review applications from creators who want to work on this order.
                                    </p>
                                    {pendingApplications.map((app) => (
                                        <div
                                            key={app.id}
                                            className="flex items-start justify-between rounded-[6px] border border-[#c4c4c4] bg-[#f6f6f6] p-[1rem]"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="font-mono text-[0.7rem] text-[#232323] break-all">
                                                    {app.creator_address}
                                                </p>
                                                {app.message && (
                                                    <p className="mt-[0.4rem] text-[0.8rem] text-[#777]">
                                                        {app.message}
                                                    </p>
                                                )}
                                                <p className="mt-[0.3rem] text-[0.7rem] text-[#a0a0a0]">
                                                    {new Date(app.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <div className="ml-[1rem] flex gap-[0.5rem] shrink-0">
                                                <button
                                                    onClick={() => handleAcceptApplication(app)}
                                                    disabled={isBusy}
                                                    className="rounded-[6px] bg-emerald-600 px-[0.8rem] py-[0.4rem] text-[0.7rem] font-bold text-white transition-colors duration-200 hover:bg-emerald-500 disabled:opacity-50"
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    onClick={() => handleRejectApplication(app)}
                                                    className="rounded-[6px] bg-[#f6f6f6] px-[0.8rem] py-[0.4rem] text-[0.7rem] font-bold text-[#232323] transition-colors duration-200 hover:bg-[#c4c4c4] border border-[#a0a0a0]"
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[0.8rem] text-[#777]">
                                    No applications yet. Share this order with creators!
                                </p>
                            )}

                        </div>
                    )}

                    {/* Open + Creator role: Apply */}
                    {status === 0 && role === "creator" && (
                        <div className="space-y-[0.8rem]">
                            {myApplication ? (
                                <div className="rounded-[6px] bg-[#fff1f3] border border-[#ffccd5] p-[1rem]">
                                    <p className="text-[0.8rem] font-bold text-[#E62058]">
                                        Application Submitted
                                    </p>
                                    {myApplication.message && (
                                        <p className="mt-[0.4rem] text-[0.8rem] text-[#777]">
                                            Your message: {myApplication.message}
                                        </p>
                                    )}
                                    <p className="mt-[0.3rem] text-[0.7rem] text-[#a0a0a0]">
                                        Status: {myApplication.status} &middot; Submitted{" "}
                                        {new Date(myApplication.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-[0.8rem] text-[#777]">
                                        Interested in this sponsorship? Submit an application to the client.
                                    </p>
                                    <textarea
                                        value={applicationMessage}
                                        onChange={(e) => setApplicationMessage(e.target.value)}
                                        placeholder="Optional message to the client (e.g. your channel name, audience size, why you're a good fit)"
                                        rows={3}
                                        className="w-full rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.8rem] text-[0.8rem] text-[#232323] placeholder-[#a0a0a0] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058] resize-none"
                                    />
                                    <button
                                        onClick={handleSubmitApplication}
                                        disabled={isSubmittingApp}
                                        className="w-full rounded-[6px] bg-[#E62058] px-[1rem] py-[0.8rem] text-[0.8rem] font-bold text-white transition-all hover:bg-[#c10f45] active:scale-95 duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className="space-y-[1rem]">
                            <p className="text-[0.8rem] text-[#777]">
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
                                <div className="rounded-[6px] bg-emerald-50 border border-emerald-200 p-[1rem]">
                                    <div className="flex items-center gap-[0.5rem] mb-[0.3rem]">
                                        <svg
                                            className="h-[1rem] w-[1rem] text-emerald-600"
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
                                        <p className="text-[0.8rem] font-bold text-emerald-700">
                                            Video Ready
                                        </p>
                                    </div>
                                    <p className="text-[0.7rem] text-[#777]">
                                        Video ID:{" "}
                                        <span className="font-mono text-[#232323]">
                                            {videoId}
                                        </span>
                                    </p>
                                </div>
                            )}

                            {/* Manual fallback */}
                            {!videoId && (
                                <div className="border-t border-[#c4c4c4] pt-[0.8rem]">
                                    <button
                                        onClick={() =>
                                            setShowManualVideoInput(
                                                !showManualVideoInput
                                            )
                                        }
                                        className="text-[0.7rem] text-[#a0a0a0] hover:text-[#232323] transition-colors duration-200"
                                    >
                                        {showManualVideoInput
                                            ? "Hide manual input"
                                            : "Or enter video details manually"}
                                    </button>
                                    {showManualVideoInput && (
                                        <div className="mt-[0.8rem] space-y-[0.8rem]">
                                            <input
                                                type="text"
                                                value={videoId}
                                                onChange={(e) =>
                                                    setVideoId(e.target.value)
                                                }
                                                placeholder="YouTube Video ID (e.g. dQw4w9WgXcQ)"
                                                className="w-full rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.8rem] text-[0.8rem] text-[#232323] placeholder-[#a0a0a0] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058]"
                                            />
                                            <input
                                                type="text"
                                                value={etagHash}
                                                onChange={(e) =>
                                                    setEtagHash(e.target.value)
                                                }
                                                placeholder="Video Etag (from YouTube API)"
                                                className="w-full rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.8rem] text-[0.8rem] text-[#232323] placeholder-[#a0a0a0] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058]"
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
                                    className="w-full rounded-[6px] bg-[#E62058] px-[1rem] py-[0.8rem] text-[0.8rem] font-bold text-white transition-all hover:bg-[#c10f45] active:scale-95 duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className="space-y-[0.8rem]">
                            <div className="rounded-[6px] bg-[#fff1f3] border border-[#ffccd5] p-[1rem]">
                                <p className="text-[0.8rem] font-bold text-[#E62058]">
                                    Waiting for Creator to Submit Video
                                </p>
                                <div className="mt-[0.8rem] space-y-[0.5rem] text-[0.8rem]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[#a0a0a0]">Creator</span>
                                        <span className="font-mono text-[0.7rem] text-[#232323]">
                                            {deal.creator.slice(0, 6)}...{deal.creator.slice(-4)}
                                        </span>
                                    </div>
                                    {deal.videoDeadline > 0n && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[#a0a0a0]">Deadline</span>
                                            <span className="text-[#232323]">
                                                {new Date(Number(deal.videoDeadline) * 1000).toLocaleDateString()}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <p className="mt-[0.8rem] text-[0.7rem] text-[#a0a0a0]">
                                    The creator needs to upload their YouTube video and submit it for your review.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* InReview + Client role: Approve Video */}
                    {status === 2 && role === "client" && (
                        <div className="space-y-[0.8rem]">
                            <p className="text-[0.8rem] text-[#777]">
                                Review the submitted video. Approving will
                                deposit{" "}
                                <span className="font-bold text-[#232323]">
                                    {formatUnits(totalPayout, 6)} USDC
                                </span>{" "}
                                into escrow.
                            </p>
                            {deal.youtubeVideoId && (
                                <a
                                    href={`https://youtube.com/watch?v=${deal.youtubeVideoId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-[0.5rem] rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.8rem] text-[0.8rem] text-[#E62058] hover:border-[#E62058] hover:bg-white transition-all duration-200"
                                >
                                    <svg
                                        className="h-[1.2rem] w-[1.2rem]"
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
                                className="w-full rounded-[6px] bg-emerald-600 px-[1rem] py-[0.8rem] text-[0.8rem] font-bold text-white transition-colors duration-200 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isBusy
                                    ? "Processing..."
                                    : `Approve Video & Deposit ${formatUnits(totalPayout, 6)} USDC`}
                            </button>
                        </div>
                    )}

                    {/* InReview + Creator role: Waiting for client */}
                    {status === 2 && role === "creator" && (
                        <div className="rounded-[6px] bg-amber-50 border border-amber-200 p-[1rem]">
                            <p className="text-[0.8rem] font-bold text-amber-700">
                                Video Under Review
                            </p>
                            <p className="mt-[0.4rem] text-[0.7rem] text-[#a0a0a0]">
                                The client is reviewing your submitted video. You&apos;ll be notified once they approve and deposit funds into escrow.
                            </p>
                        </div>
                    )}

                    {/* Active + Creator role: Claim earnings */}
                    {status === 3 && role === "creator" && (
                        <div className="space-y-[1rem]">
                            <p className="text-[0.8rem] text-[#777]">
                                View counts are verified on-chain every 5 minutes via Flare&apos;s FDC protocol. Claim your earnings when ready.
                            </p>

                            {/* Verified views */}
                            <div className="rounded-[6px] bg-[#f6f6f6] p-[1rem]">
                                <div className="flex items-center justify-between">
                                    <span className="text-[0.7rem] text-[#a0a0a0]">Verified Views</span>
                                    <button
                                        onClick={() => { refetchDeal(); refetchMilestones(); }}
                                        className="text-[0.7rem] text-[#a0a0a0] hover:text-[#E62058] transition-colors"
                                    >
                                        Refresh
                                    </button>
                                </div>
                                <p className="mt-[0.3rem] text-[2rem] font-bold text-[#232323]">
                                    {Number(deal.lastVerifiedViews).toLocaleString()}
                                </p>
                            </div>

                            {/* Milestone claim buttons */}
                            {paymentMode === 0 && milestones && (
                                <div className="space-y-[0.5rem]">
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
                                                className={`w-full rounded-[6px] px-[1rem] py-[0.8rem] text-[0.8rem] font-bold text-white transition-all active:scale-95 duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                                                    reached ? "bg-emerald-600 hover:bg-emerald-500" : "bg-[#a0a0a0]"
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
                                        className="w-full rounded-[6px] bg-emerald-600 px-[1rem] py-[0.8rem] text-[0.8rem] font-bold text-white transition-all active:scale-95 duration-200 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className="space-y-[0.8rem]">
                            <p className="text-[0.8rem] text-[#777]">
                                This deal is active. View counts are verified on-chain every 5 minutes via Flare&apos;s FDC protocol.
                            </p>
                            <div className="rounded-[6px] bg-[#f6f6f6] p-[1rem]">
                                <div className="flex items-center justify-between">
                                    <span className="text-[0.7rem] text-[#a0a0a0]">Verified Views</span>
                                    <button
                                        onClick={() => { refetchDeal(); refetchMilestones(); }}
                                        className="text-[0.7rem] text-[#a0a0a0] hover:text-[#E62058] transition-colors"
                                    >
                                        Refresh
                                    </button>
                                </div>
                                <p className="mt-[0.3rem] text-[2rem] font-bold text-[#232323]">
                                    {Number(deal.lastVerifiedViews).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Completed / Terminated */}
                    {status === 4 && (
                        <div className="rounded-[6px] bg-emerald-50 border border-emerald-200 p-[1rem]">
                            <p className="text-[0.8rem] text-emerald-700">
                                This deal has been completed. All milestones
                                have been resolved.
                            </p>
                        </div>
                    )}
                    {status === 5 && (
                        <div className="rounded-[6px] bg-red-50 border border-red-200 p-[1rem]">
                            <p className="text-[0.8rem] text-red-700">
                                This deal was terminated due to video tampering.
                                Remaining funds were returned to the client.
                            </p>
                        </div>
                    )}

                    {/* Not connected to right role — only show for non-Open, non-terminal deals */}
                    {!isClient && !isCreator && status > 0 && status < 4 && (
                        <p className="text-[0.8rem] text-[#a0a0a0]">
                            You are not a participant in this deal. Connect the
                            client or creator wallet to take actions.
                        </p>
                    )}
                </div>
            )}

            {!address && (
                <div className="rounded-[10px] border border-dashed border-[#c4c4c4] p-[2rem] text-center">
                    <p className="text-[#a0a0a0]">
                        Connect your wallet to interact with this order
                    </p>
                </div>
            )}
        </div>
    );
}
