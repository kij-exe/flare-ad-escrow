"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { TRUSTTUBE_ABI, TRUSTTUBE_ADDRESS } from "@/config/contracts";
import { formatUnits } from "viem";
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

function DashboardDealCard({
    dealId,
    role,
    userAddress,
}: {
    dealId: number;
    role: "client" | "creator";
    userAddress: string;
}) {
    const { data: deal } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "getDeal",
        args: [BigInt(dealId)],
    });

    const { data: milestones } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "getMilestones",
        args: [BigInt(dealId)],
    });

    if (!deal) return null;

    // Filter based on role
    if (role === "client" && deal.client.toLowerCase() !== userAddress.toLowerCase()) {
        return null;
    }
    if (role === "creator" && deal.creator.toLowerCase() !== userAddress.toLowerCase()) {
        return null;
    }

    const status = Number(deal.status);
    const paymentMode = Number(deal.paymentMode);

    // Calculate total payout
    let totalPayout = 0n;
    if (paymentMode === 0 && milestones) {
        totalPayout = (milestones as readonly { payoutAmount: bigint }[]).reduce(
            (sum, m) => sum + m.payoutAmount,
            0n
        );
    }

    // Calculate milestone progress
    let paidCount = 0;
    let totalCount = 0;
    if (paymentMode === 0 && milestones) {
        const ms = milestones as readonly { isPaid: boolean }[];
        totalCount = ms.length;
        paidCount = ms.filter((m) => m.isPaid).length;
    }

    const counterparty =
        role === "client"
            ? deal.creator === ZERO_ADDRESS
                ? "Awaiting creator"
                : deal.creator
            : deal.client;

    return (
        <Link href={`/order/${dealId}`}>
            <div className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-all hover:border-zinc-600 hover:bg-zinc-800/50 cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-zinc-100">
                        Order #{dealId}
                    </h3>
                    <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}
                    >
                        {STATUS_LABELS[status]}
                    </span>
                </div>

                <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Mode</span>
                        <span className="text-zinc-300">
                            {MODE_LABELS[paymentMode]}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-500">
                            {role === "client" ? "Creator" : "Client"}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">
                            {counterparty === "Awaiting creator"
                                ? counterparty
                                : `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`}
                        </span>
                    </div>
                    {deal.youtubeVideoId && (
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Video</span>
                            <span className="text-xs text-blue-400">
                                {deal.youtubeVideoId}
                            </span>
                        </div>
                    )}

                    {/* Milestone progress */}
                    {paymentMode === 0 && totalCount > 0 && (
                        <div className="pt-2">
                            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                                <span>Milestone Progress</span>
                                <span>
                                    {paidCount} / {totalCount}
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-zinc-800">
                                <div
                                    className="h-1.5 rounded-full bg-blue-600 transition-all"
                                    style={{
                                        width: `${(paidCount / totalCount) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Payment progress for active deals */}
                    {deal.totalDeposited > 0n && (
                        <div className="pt-2">
                            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                                <span>Payment</span>
                                <span>
                                    {formatUnits(deal.totalPaid, 6)} /{" "}
                                    {formatUnits(deal.totalDeposited, 6)} USDC
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-zinc-800">
                                <div
                                    className="h-1.5 rounded-full bg-emerald-600 transition-all"
                                    style={{
                                        width: `${Math.min(100, (Number(deal.totalPaid) / Number(deal.totalDeposited)) * 100)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-3 pt-3 border-t border-zinc-800">
                    <span className="text-xs text-zinc-500 group-hover:text-blue-400 transition-colors">
                        View details &rarr;
                    </span>
                </div>
            </div>
        </Link>
    );
}

function DealsList({
    role,
    userAddress,
    dealCount,
}: {
    role: "client" | "creator";
    userAddress: string;
    dealCount: number;
}) {
    if (dealCount === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-16">
                <p className="text-zinc-500">No deals found</p>
                {role === "client" && (
                    <Link
                        href="/create-order"
                        className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        Create your first order &rarr;
                    </Link>
                )}
                {role === "creator" && (
                    <Link
                        href="/marketplace"
                        className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        Browse the marketplace &rarr;
                    </Link>
                )}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: dealCount }, (_, i) => (
                <DashboardDealCard
                    key={i}
                    dealId={i}
                    role={role}
                    userAddress={userAddress}
                />
            ))}
        </div>
    );
}

export default function Dashboard() {
    const { address, isConnected } = useAccount();
    const [activeTab, setActiveTab] = useState<"client" | "creator">("client");

    const { data: nextDealId, isLoading } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "nextDealId",
    });

    const dealCount = nextDealId ? Number(nextDealId) : 0;

    if (!isConnected || !address) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
                    <svg
                        className="h-10 w-10 text-zinc-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
                        />
                    </svg>
                </div>
                <h2 className="text-xl font-semibold text-zinc-200">
                    Connect Your Wallet
                </h2>
                <p className="mt-2 text-zinc-500">
                    Connect your wallet to view your sponsorship deals
                </p>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-zinc-50">Dashboard</h1>
                <p className="mt-2 text-zinc-400">
                    Manage your sponsorship deals
                </p>
            </div>

            {/* Tabs */}
            <div className="mb-6 flex gap-1 rounded-lg bg-zinc-900 p-1 border border-zinc-800 w-fit">
                <button
                    onClick={() => setActiveTab("client")}
                    className={`rounded-md px-5 py-2.5 text-sm font-medium transition-all ${
                        activeTab === "client"
                            ? "bg-zinc-800 text-zinc-100 shadow-sm"
                            : "text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                    As Client
                </button>
                <button
                    onClick={() => setActiveTab("creator")}
                    className={`rounded-md px-5 py-2.5 text-sm font-medium transition-all ${
                        activeTab === "creator"
                            ? "bg-zinc-800 text-zinc-100 shadow-sm"
                            : "text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                    As Creator
                </button>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-900 p-5"
                        >
                            <div className="mb-3 h-5 w-28 rounded bg-zinc-800" />
                            <div className="space-y-2">
                                <div className="h-4 w-40 rounded bg-zinc-800" />
                                <div className="h-4 w-36 rounded bg-zinc-800" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <DealsList
                    role={activeTab}
                    userAddress={address}
                    dealCount={dealCount}
                />
            )}
        </div>
    );
}
