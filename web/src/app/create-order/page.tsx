"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { TRUSTTUBE_ABI, TRUSTTUBE_ADDRESS, MOCK_USDC_ADDRESS } from "@/config/contracts";
import toast from "react-hot-toast";

interface MilestoneRow {
    viewTarget: string;
    payoutAmount: string;
    deadlineDays: string;
}

export default function CreateOrder() {
    const router = useRouter();
    const { isConnected } = useAccount();
    const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash: txHash,
    });

    // Redirect only after tx is confirmed on-chain
    useEffect(() => {
        if (isConfirmed) {
            toast.success("Order created successfully!");
            router.push("/marketplace");
        }
    }, [isConfirmed, router]);

    // Show error toast with full details
    useEffect(() => {
        if (writeError) {
            console.error("writeContract error:", writeError);
            console.error("Error name:", writeError.name);
            console.error("Error message:", writeError.message);
            toast.error(
                writeError.message.includes("User rejected")
                    ? "Transaction rejected"
                    : `Failed: ${writeError.message.slice(0, 100)}`
            );
        }
    }, [writeError]);

    // Debug: log tx hash when received
    useEffect(() => {
        if (txHash) {
            console.log("Transaction hash:", txHash);
        }
    }, [txHash]);

    const [paymentMode, setPaymentMode] = useState<"milestone" | "linear">(
        "milestone"
    );
    const [videoDeadlineDays, setVideoDeadlineDays] = useState("7");

    // Milestone fields
    const [milestones, setMilestones] = useState<MilestoneRow[]>([
        { viewTarget: "1000", payoutAmount: "50", deadlineDays: "30" },
    ]);

    // Linear fields
    const [ratePerView, setRatePerView] = useState("0.001");
    const [totalCap, setTotalCap] = useState("500");

    const addMilestone = () => {
        setMilestones([
            ...milestones,
            { viewTarget: "", payoutAmount: "", deadlineDays: "30" },
        ]);
    };

    const removeMilestone = (index: number) => {
        if (milestones.length > 1) {
            setMilestones(milestones.filter((_, i) => i !== index));
        }
    };

    const updateMilestone = (
        index: number,
        field: keyof MilestoneRow,
        value: string
    ) => {
        const updated = [...milestones];
        updated[index] = { ...updated[index], [field]: value };
        setMilestones(updated);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        console.log("=== handleSubmit called ===");
        console.log("isConnected:", isConnected);
        console.log("TRUSTTUBE_ADDRESS:", TRUSTTUBE_ADDRESS);
        console.log("MOCK_USDC_ADDRESS:", MOCK_USDC_ADDRESS);
        console.log("paymentMode:", paymentMode);

        if (!isConnected) {
            toast.error("Please connect your wallet first");
            return;
        }

        try {
            if (paymentMode === "milestone") {
                const viewTargets = milestones.map((m) => BigInt(m.viewTarget));
                const payoutAmounts = milestones.map((m) =>
                    parseUnits(m.payoutAmount, 6)
                );
                const deadlineDurations = milestones.map(
                    (m) => BigInt(Number(m.deadlineDays) * 86400)
                );

                console.log("Calling createMilestoneOrder with:", {
                    stablecoin: MOCK_USDC_ADDRESS,
                    videoDeadlineDays,
                    viewTargets: viewTargets.map(String),
                    payoutAmounts: payoutAmounts.map(String),
                    deadlineDurations: deadlineDurations.map(String),
                });

                writeContract({
                    address: TRUSTTUBE_ADDRESS as `0x${string}`,
                    abi: TRUSTTUBE_ABI,
                    functionName: "createMilestoneOrder",
                    args: [
                        MOCK_USDC_ADDRESS as `0x${string}`,
                        BigInt(videoDeadlineDays),
                        viewTargets,
                        payoutAmounts,
                        deadlineDurations,
                    ],
                });
            } else {
                const rateInUnits = parseUnits(ratePerView, 6);
                const capInUnits = parseUnits(totalCap, 6);

                console.log("Calling createLinearOrder with:", {
                    stablecoin: MOCK_USDC_ADDRESS,
                    videoDeadlineDays,
                    ratePerView: String(rateInUnits),
                    totalCap: String(capInUnits),
                });

                writeContract({
                    address: TRUSTTUBE_ADDRESS as `0x${string}`,
                    abi: TRUSTTUBE_ABI,
                    functionName: "createLinearOrder",
                    args: [
                        MOCK_USDC_ADDRESS as `0x${string}`,
                        BigInt(videoDeadlineDays),
                        rateInUnits,
                        capInUnits,
                    ],
                });
            }
        } catch {
            toast.error("An unexpected error occurred");
        }
    };

    const totalMilestonePayout = milestones.reduce(
        (sum, m) => sum + (parseFloat(m.payoutAmount) || 0),
        0
    );

    return (
        <div className="mx-auto max-w-2xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-zinc-50">
                    Create Sponsorship Order
                </h1>
                <p className="mt-2 text-zinc-400">
                    Define your sponsorship terms and payment structure
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Payment Mode Toggle */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                    <label className="mb-3 block text-sm font-medium text-zinc-300">
                        Payment Mode
                    </label>
                    <div className="flex rounded-lg bg-zinc-800 p-1">
                        <button
                            type="button"
                            onClick={() => setPaymentMode("milestone")}
                            className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                                paymentMode === "milestone"
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-zinc-400 hover:text-zinc-200"
                            }`}
                        >
                            Milestone
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaymentMode("linear")}
                            className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                                paymentMode === "linear"
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-zinc-400 hover:text-zinc-200"
                            }`}
                        >
                            Linear (Pay-per-View)
                        </button>
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">
                        {paymentMode === "milestone"
                            ? "Pay fixed amounts when specific view count targets are reached."
                            : "Pay a fixed rate per view up to a maximum cap."}
                    </p>
                </div>

                {/* Video Deadline */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                    <label className="mb-3 block text-sm font-medium text-zinc-300">
                        Video Deadline (days after creator acceptance)
                    </label>
                    <input
                        type="number"
                        min="1"
                        value={videoDeadlineDays}
                        onChange={(e) => setVideoDeadlineDays(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Number of days"
                        required
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                        The creator must submit their video within this many days of accepting the order.
                    </p>
                </div>

                {/* Milestone Configuration */}
                {paymentMode === "milestone" && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <label className="text-sm font-medium text-zinc-300">
                                Milestones
                            </label>
                            <button
                                type="button"
                                onClick={addMilestone}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-700"
                            >
                                <svg
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 4.5v15m7.5-7.5h-15"
                                    />
                                </svg>
                                Add Milestone
                            </button>
                        </div>

                        <div className="space-y-4">
                            {milestones.map((milestone, index) => (
                                <div
                                    key={index}
                                    className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4"
                                >
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-xs font-medium text-zinc-400">
                                            Milestone {index + 1}
                                        </span>
                                        {milestones.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removeMilestone(index)
                                                }
                                                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="mb-1 block text-xs text-zinc-500">
                                                View Target
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={milestone.viewTarget}
                                                onChange={(e) =>
                                                    updateMilestone(
                                                        index,
                                                        "viewTarget",
                                                        e.target.value
                                                    )
                                                }
                                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="e.g. 10000"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs text-zinc-500">
                                                Payout (USDC)
                                            </label>
                                            <input
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                value={milestone.payoutAmount}
                                                onChange={(e) =>
                                                    updateMilestone(
                                                        index,
                                                        "payoutAmount",
                                                        e.target.value
                                                    )
                                                }
                                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="e.g. 100"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs text-zinc-500">
                                                Deadline (days)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={milestone.deadlineDays}
                                                onChange={(e) =>
                                                    updateMilestone(
                                                        index,
                                                        "deadlineDays",
                                                        e.target.value
                                                    )
                                                }
                                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="e.g. 30"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 flex items-center justify-between rounded-lg bg-zinc-800 px-4 py-3">
                            <span className="text-sm text-zinc-400">
                                Total Payout
                            </span>
                            <span className="text-sm font-semibold text-zinc-100">
                                {totalMilestonePayout.toFixed(2)} USDC
                            </span>
                        </div>
                    </div>
                )}

                {/* Linear Configuration */}
                {paymentMode === "linear" && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                        <label className="mb-4 block text-sm font-medium text-zinc-300">
                            Linear Payment Configuration
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-1 block text-xs text-zinc-500">
                                    Rate per View (USDC)
                                </label>
                                <input
                                    type="number"
                                    min="0.000001"
                                    step="0.000001"
                                    value={ratePerView}
                                    onChange={(e) =>
                                        setRatePerView(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="e.g. 0.001"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs text-zinc-500">
                                    Total Cap (USDC)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    value={totalCap}
                                    onChange={(e) =>
                                        setTotalCap(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="e.g. 500"
                                    required
                                />
                            </div>
                        </div>
                        <div className="mt-4 rounded-lg bg-zinc-800 px-4 py-3">
                            <p className="text-xs text-zinc-500">
                                At {ratePerView} USDC per view with a{" "}
                                {totalCap} USDC cap, the creator will be fully
                                paid at{" "}
                                <span className="font-medium text-zinc-300">
                                    {(
                                        parseFloat(totalCap) /
                                        parseFloat(ratePerView || "1")
                                    ).toLocaleString()}{" "}
                                    views
                                </span>
                                .
                            </p>
                        </div>
                    </div>
                )}

                {/* Submit */}
                <div className="flex items-center gap-4">
                    <button
                        type="submit"
                        disabled={isPending || isConfirming || !isConnected}
                        className="inline-flex h-12 flex-1 items-center justify-center rounded-lg bg-blue-600 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isPending || isConfirming ? (
                            <span className="flex items-center gap-2">
                                <svg
                                    className="h-4 w-4 animate-spin"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                    />
                                </svg>
                                {isPending
                                    ? "Confirm in Wallet..."
                                    : "Processing..."}
                            </span>
                        ) : !isConnected ? (
                            "Connect Wallet to Continue"
                        ) : (
                            "Create Order"
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
