"use client";

import { useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { TRUSTTUBE_ABI, TRUSTTUBE_ADDRESS } from "@/config/contracts";
import Link from "next/link";
import { formatUnits } from "viem";
import { useRole } from "@/context/RoleContext";
import { getApplicationCounts } from "@/lib/applications";

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

function DealCard({ dealId, appCount }: { dealId: number; appCount?: number }) {
    const { role } = useRole();
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

    const { data: linearConfig } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "getLinearConfig",
        args: [BigInt(dealId)],
    });

    if (!deal) {
        return (
            <div className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <div className="mb-4 h-6 w-32 rounded bg-zinc-800" />
                <div className="space-y-3">
                    <div className="h-4 w-48 rounded bg-zinc-800" />
                    <div className="h-4 w-40 rounded bg-zinc-800" />
                    <div className="h-4 w-36 rounded bg-zinc-800" />
                </div>
            </div>
        );
    }

    const status = Number(deal.status);
    const paymentMode = Number(deal.paymentMode);

    // Calculate total payout for display
    let totalPayout = "0";
    if (paymentMode === 0 && milestones) {
        const total = (milestones as readonly { payoutAmount: bigint }[]).reduce(
            (sum: bigint, m: { payoutAmount: bigint }) => sum + m.payoutAmount,
            0n
        );
        totalPayout = formatUnits(total, 6);
    } else if (paymentMode === 1 && linearConfig) {
        totalPayout = formatUnits(
            (linearConfig as { totalCap: bigint }).totalCap,
            6
        );
    }

    return (
        <Link href={`/order/${dealId}`}>
            <div className="group rounded-xl border border-zinc-800 bg-zinc-900 p-6 transition-all hover:border-zinc-600 hover:bg-zinc-800/50 cursor-pointer">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-zinc-100">
                        Order #{dealId}
                    </h3>
                    <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS[0]}`}
                    >
                        {STATUS_LABELS[status]}
                    </span>
                </div>
                <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Payment Mode</span>
                        <span className="flex items-center gap-1.5 text-zinc-200">
                            <span
                                className={`inline-block h-2 w-2 rounded-full ${paymentMode === 0 ? "bg-blue-500" : "bg-violet-500"}`}
                            />
                            {MODE_LABELS[paymentMode]}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Total Budget</span>
                        <span className="font-medium text-zinc-200">
                            {totalPayout} USDC
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Client</span>
                        <span className="font-mono text-xs text-zinc-400">
                            {deal.client.slice(0, 6)}...{deal.client.slice(-4)}
                        </span>
                    </div>
                    {paymentMode === 0 && milestones && (
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Milestones</span>
                            <span className="text-zinc-200">
                                {(milestones as readonly unknown[]).length} targets
                            </span>
                        </div>
                    )}
                    {role === "creator" && status === 0 && appCount !== undefined && appCount > 0 && (
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Applications</span>
                            <span className="rounded-full bg-blue-900/50 border border-blue-800 px-2.5 py-0.5 text-xs font-medium text-blue-300">
                                {appCount}
                            </span>
                        </div>
                    )}
                </div>
                <div className="mt-4 pt-4 border-t border-zinc-800">
                    <span className="text-xs text-zinc-500 group-hover:text-blue-400 transition-colors">
                        View details &rarr;
                    </span>
                </div>
            </div>
        </Link>
    );
}

export default function Marketplace() {
    const { role } = useRole();
    const [appCounts, setAppCounts] = useState<Record<number, number>>({});

    const { data: nextDealId, isLoading } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "nextDealId",
        query: {
            refetchInterval: 5000,
        },
    });

    const dealCount = nextDealId ? Number(nextDealId) : 0;

    useEffect(() => {
        if (role === "creator" && dealCount > 0) {
            const dealIds = Array.from({ length: dealCount }, (_, i) => i);
            getApplicationCounts(dealIds).then(setAppCounts).catch(() => {});
        }
    }, [role, dealCount]);

    return (
        <div>
            <div className="mb-8 flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50">
                        Marketplace
                    </h1>
                    <p className="mt-2 text-zinc-400">
                        {role === "creator"
                            ? "Find sponsorship opportunities from clients"
                            : "Browse open sponsorship orders from clients looking for YouTube creators"}
                    </p>
                </div>
                {role === "client" && (
                    <Link
                        href="/create-order"
                        className="hidden sm:inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                    >
                        + New Order
                    </Link>
                )}
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-900 p-6"
                        >
                            <div className="mb-4 h-6 w-32 rounded bg-zinc-800" />
                            <div className="space-y-3">
                                <div className="h-4 w-48 rounded bg-zinc-800" />
                                <div className="h-4 w-40 rounded bg-zinc-800" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : dealCount === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                        <svg
                            className="h-8 w-8 text-zinc-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                            />
                        </svg>
                    </div>
                    <p className="text-lg font-medium text-zinc-400">
                        No orders yet
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                        {role === "creator"
                            ? "No sponsorship opportunities available yet"
                            : "Be the first to create a sponsorship order"}
                    </p>
                    {role === "client" && (
                        <Link
                            href="/create-order"
                            className="mt-4 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            Create the first order &rarr;
                        </Link>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: dealCount }, (_, i) => (
                        <DealCard key={i} dealId={i} appCount={appCounts[i]} />
                    ))}
                </div>
            )}
        </div>
    );
}
