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
    0: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    1: "bg-[#fff1f3] text-[#E62058] border border-[#ffccd5]",
    2: "bg-amber-50 text-amber-700 border border-amber-200",
    3: "bg-violet-50 text-violet-700 border border-violet-200",
    4: "bg-[#f6f6f6] text-[#777] border border-[#c4c4c4]",
    5: "bg-red-50 text-red-700 border border-red-200",
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
            <div className="animate-pulse rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
                <div className="mb-[1rem] h-[1.2rem] w-[6rem] rounded-[6px] bg-[#f6f6f6]" />
                <div className="space-y-[0.6rem]">
                    <div className="h-[0.8rem] w-[10rem] rounded-[6px] bg-[#f6f6f6]" />
                    <div className="h-[0.8rem] w-[8rem] rounded-[6px] bg-[#f6f6f6]" />
                    <div className="h-[0.8rem] w-[7rem] rounded-[6px] bg-[#f6f6f6]" />
                </div>
            </div>
        );
    }

    const status = Number(deal.status);
    const paymentMode = Number(deal.paymentMode);

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
            <div className="group rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem] transition-all duration-300 hover:border-[#a0a0a0] hover:shadow-lg hover:shadow-[#E62058]/5 hover:-translate-y-[10px] cursor-pointer">
                <div className="flex items-center justify-between mb-[1rem]">
                    <h3 className="text-[1.1rem] font-bold text-[#232323]">
                        Order #{dealId}
                    </h3>
                    <span
                        className={`px-[0.6rem] py-[0.2rem] rounded-full text-[0.6rem] font-bold ${STATUS_COLORS[status] || STATUS_COLORS[0]}`}
                    >
                        {STATUS_LABELS[status]}
                    </span>
                </div>
                <div className="space-y-[0.6rem] text-[0.8rem]">
                    <div className="flex items-center justify-between">
                        <span className="text-[#777]">Payment Mode</span>
                        <span className="flex items-center gap-[0.4rem] text-[#232323] font-medium">
                            <span
                                className={`inline-block h-[0.4rem] w-[0.4rem] rounded-full ${paymentMode === 0 ? "bg-[#E62058]" : "bg-violet-500"}`}
                            />
                            {MODE_LABELS[paymentMode]}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[#777]">Total Budget</span>
                        <span className="font-bold text-[#232323]">
                            {totalPayout} USDC
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[#777]">Client</span>
                        <span className="font-mono text-[0.7rem] text-[#777]">
                            {deal.client.slice(0, 6)}...{deal.client.slice(-4)}
                        </span>
                    </div>
                    {paymentMode === 0 && milestones && (
                        <div className="flex items-center justify-between">
                            <span className="text-[#777]">Milestones</span>
                            <span className="text-[#232323] font-medium">
                                {(milestones as readonly unknown[]).length} targets
                            </span>
                        </div>
                    )}
                    {role === "creator" && status === 0 && appCount !== undefined && appCount > 0 && (
                        <div className="flex items-center justify-between">
                            <span className="text-[#777]">Applications</span>
                            <span className="rounded-full bg-[#fff1f3] border border-[#ffccd5] px-[0.6rem] py-[0.1rem] text-[0.6rem] font-bold text-[#E62058]">
                                {appCount}
                            </span>
                        </div>
                    )}
                </div>
                <div className="mt-[1rem] pt-[1rem] border-t border-[#c4c4c4]">
                    <span className="text-[0.7rem] text-[#777] group-hover:text-[#E62058] transition-colors duration-200">
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
            <div className="mb-[2rem] flex items-end justify-between">
                <div>
                    <h1 className="text-[2.4rem] leading-[2.7rem] font-bold text-[#232323]">
                        Marketplace
                    </h1>
                    <p className="mt-[0.4rem] text-[0.95rem] text-[#777]">
                        {role === "creator"
                            ? "Find sponsorship opportunities from clients"
                            : "Browse open sponsorship orders from clients looking for YouTube creators"}
                    </p>
                </div>
                {role === "client" && (
                    <Link
                        href="/create-order"
                        className="hidden sm:inline-flex h-[2.4rem] items-center justify-center rounded-[10px] bg-[#E62058] px-[1.2rem] text-[0.8rem] font-bold text-white transition-all hover:bg-[#c10f45] active:scale-95 duration-200"
                    >
                        + New Order
                    </Link>
                )}
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 gap-[1.2rem] md:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="animate-pulse rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]"
                        >
                            <div className="mb-[1rem] h-[1.2rem] w-[6rem] rounded-[6px] bg-[#f6f6f6]" />
                            <div className="space-y-[0.6rem]">
                                <div className="h-[0.8rem] w-[10rem] rounded-[6px] bg-[#f6f6f6]" />
                                <div className="h-[0.8rem] w-[8rem] rounded-[6px] bg-[#f6f6f6]" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : dealCount === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-[#a0a0a0] py-[4.8rem]">
                    <div className="mb-[1rem] flex h-[3.2rem] w-[3.2rem] items-center justify-center rounded-full bg-[#f6f6f6]">
                        <svg
                            className="h-[1.6rem] w-[1.6rem] text-[#a0a0a0]"
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
                    <p className="text-[1rem] font-bold text-[#777]">
                        No orders yet
                    </p>
                    <p className="mt-[0.2rem] text-[0.8rem] text-[#a0a0a0]">
                        {role === "creator"
                            ? "No sponsorship opportunities available yet"
                            : "Be the first to create a sponsorship order"}
                    </p>
                    {role === "client" && (
                        <Link
                            href="/create-order"
                            className="mt-[1rem] text-[0.8rem] font-bold text-[#E62058] hover:text-[#c10f45] transition-colors duration-200"
                        >
                            Create the first order &rarr;
                        </Link>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-[1.2rem] md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: dealCount }, (_, i) => (
                        <DealCard key={i} dealId={i} appCount={appCounts[i]} />
                    ))}
                </div>
            )}
        </div>
    );
}
