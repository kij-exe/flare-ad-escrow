"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem/utils";
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
            <div className="mb-[2rem]">
                <h1 className="text-[2.4rem] leading-[2.7rem] font-bold text-[#232323]">
                    Create Sponsorship Order
                </h1>
                <p className="mt-[0.5rem] text-[0.8rem] font-medium text-[#777]">
                    Define your sponsorship terms and payment structure
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-[2rem]">
                {/* Payment Mode Toggle */}
                <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
                    <label className="mb-[0.8rem] block text-[0.8rem] font-medium text-[#232323]">
                        Payment Mode
                    </label>
                    <div className="flex rounded-[6px] bg-[#f6f6f6] p-1">
                        <button
                            type="button"
                            onClick={() => setPaymentMode("milestone")}
                            className={`flex-1 rounded-[6px] px-[1rem] py-[0.8rem] text-[0.8rem] font-bold transition-all duration-200 ${
                                paymentMode === "milestone"
                                    ? "bg-[#E62058] text-white shadow-sm"
                                    : "text-[#777] hover:text-[#232323]"
                            }`}
                        >
                            Milestone
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaymentMode("linear")}
                            className={`flex-1 rounded-[6px] px-[1rem] py-[0.8rem] text-[0.8rem] font-bold transition-all duration-200 ${
                                paymentMode === "linear"
                                    ? "bg-[#E62058] text-white shadow-sm"
                                    : "text-[#777] hover:text-[#232323]"
                            }`}
                        >
                            Linear (Pay-per-View)
                        </button>
                    </div>
                    <p className="mt-[0.8rem] text-[0.7rem] text-[#777]">
                        {paymentMode === "milestone"
                            ? "Pay fixed amounts when specific view count targets are reached."
                            : "Pay a fixed rate per view up to a maximum cap."}
                    </p>
                </div>

                {/* Video Deadline */}
                <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
                    <label className="mb-[0.8rem] block text-[0.8rem] font-medium text-[#232323]">
                        Video Deadline (days after creator acceptance)
                    </label>
                    <input
                        type="number"
                        min="1"
                        value={videoDeadlineDays}
                        onChange={(e) => setVideoDeadlineDays(e.target.value)}
                        className="w-full rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.8rem] text-[0.8rem] text-[#232323] placeholder-[#777] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058]"
                        placeholder="Number of days"
                        required
                    />
                    <p className="mt-[0.5rem] text-[0.7rem] text-[#777]">
                        The creator must submit their video within this many days of accepting the order.
                    </p>
                </div>

                {/* Milestone Configuration */}
                {paymentMode === "milestone" && (
                    <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
                        <div className="mb-[1rem] flex items-center justify-between">
                            <label className="text-[0.8rem] font-medium text-[#232323]">
                                Milestones
                            </label>
                            <button
                                type="button"
                                onClick={addMilestone}
                                className="inline-flex items-center gap-[0.4rem] rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[0.8rem] py-[0.4rem] text-[0.7rem] font-bold text-[#232323] transition-all duration-200 hover:border-[#E62058] hover:bg-[#fff1f3]"
                            >
                                <svg
                                    className="h-[0.8rem] w-[0.8rem]"
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

                        <div className="space-y-[1rem]">
                            {milestones.map((milestone, index) => (
                                <div
                                    key={index}
                                    className="rounded-[6px] border border-[#c4c4c4] bg-[#f6f6f6] p-[1rem]"
                                >
                                    <div className="mb-[0.8rem] flex items-center justify-between">
                                        <span className="text-[0.7rem] font-bold text-[#777]">
                                            Milestone {index + 1}
                                        </span>
                                        {milestones.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removeMilestone(index)
                                                }
                                                className="text-[0.7rem] text-[#E62058] hover:text-[#c10f45] transition-all duration-200"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-[0.8rem]">
                                        <div>
                                            <label className="mb-[0.3rem] block text-[0.7rem] text-[#777]">
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
                                                className="w-full rounded-[6px] border border-[#a0a0a0] bg-white px-[1rem] py-[0.8rem] text-[0.8rem] text-[#232323] placeholder-[#777] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058]"
                                                placeholder="e.g. 10000"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-[0.3rem] block text-[0.7rem] text-[#777]">
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
                                                className="w-full rounded-[6px] border border-[#a0a0a0] bg-white px-[1rem] py-[0.8rem] text-[0.8rem] text-[#232323] placeholder-[#777] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058]"
                                                placeholder="e.g. 100"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-[0.3rem] block text-[0.7rem] text-[#777]">
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
                                                className="w-full rounded-[6px] border border-[#a0a0a0] bg-white px-[1rem] py-[0.8rem] text-[0.8rem] text-[#232323] placeholder-[#777] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058]"
                                                placeholder="e.g. 30"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-[1rem] flex items-center justify-between rounded-[6px] bg-[#fff1f3] px-[1rem] py-[0.8rem]">
                            <span className="text-[0.8rem] font-medium text-[#777]">
                                Total Payout
                            </span>
                            <span className="text-[0.8rem] font-bold text-[#232323]">
                                {totalMilestonePayout.toFixed(2)} USDC
                            </span>
                        </div>
                    </div>
                )}

                {/* Linear Configuration */}
                {paymentMode === "linear" && (
                    <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
                        <label className="mb-[1rem] block text-[0.8rem] font-medium text-[#232323]">
                            Linear Payment Configuration
                        </label>
                        <div className="grid grid-cols-2 gap-[1rem]">
                            <div>
                                <label className="mb-[0.3rem] block text-[0.7rem] text-[#777]">
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
                                    className="w-full rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.8rem] text-[0.8rem] text-[#232323] placeholder-[#777] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058]"
                                    placeholder="e.g. 0.001"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-[0.3rem] block text-[0.7rem] text-[#777]">
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
                                    className="w-full rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.8rem] text-[0.8rem] text-[#232323] placeholder-[#777] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058]"
                                    placeholder="e.g. 500"
                                    required
                                />
                            </div>
                        </div>
                        <div className="mt-[1rem] rounded-[6px] bg-[#fff1f3] px-[1rem] py-[0.8rem]">
                            <p className="text-[0.7rem] text-[#777]">
                                At {ratePerView} USDC per view with a{" "}
                                {totalCap} USDC cap, the creator will be fully
                                paid at{" "}
                                <span className="font-bold text-[#232323]">
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
                <div className="flex items-center gap-[1rem]">
                    <button
                        type="submit"
                        disabled={isPending || isConfirming || !isConnected}
                        className="inline-flex h-[3rem] flex-1 items-center justify-center rounded-[6px] bg-[#E62058] text-[0.8rem] font-bold text-white transition-all duration-200 hover:bg-[#c10f45] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isPending || isConfirming ? (
                            <span className="flex items-center gap-[0.5rem]">
                                <svg
                                    className="h-[1rem] w-[1rem] animate-spin"
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
