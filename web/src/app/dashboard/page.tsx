"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { TRUSTTUBE_ABI, TRUSTTUBE_ADDRESS } from "@/config/contracts";
import { formatUnits } from "viem";
import Link from "next/link";
import { useRole } from "@/context/RoleContext";
import { type DealApplication, getApplicationsByCreator } from "@/lib/applications";

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

const APP_STATUS_COLORS: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    accepted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    rejected: "bg-red-50 text-red-700 border border-red-200",
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

    if (role === "client" && deal.client.toLowerCase() !== userAddress.toLowerCase()) {
        return null;
    }
    if (role === "creator" && deal.creator.toLowerCase() !== userAddress.toLowerCase()) {
        return null;
    }

    const status = Number(deal.status);
    const paymentMode = Number(deal.paymentMode);

    let totalPayout = 0n;
    if (paymentMode === 0 && milestones) {
        totalPayout = (milestones as readonly { payoutAmount: bigint }[]).reduce(
            (sum, m) => sum + m.payoutAmount,
            0n
        );
    }

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
            <div className="group rounded-[10px] border border-[#c4c4c4] bg-white p-[1.2rem] transition-all duration-300 hover:border-[#a0a0a0] hover:shadow-lg hover:shadow-[#E62058]/5 hover:-translate-y-[10px] cursor-pointer">
                <div className="flex items-center justify-between mb-[0.8rem]">
                    <h3 className="text-[0.95rem] font-bold text-[#232323]">
                        Order #{dealId}
                    </h3>
                    <span
                        className={`px-[0.6rem] py-[0.2rem] rounded-full text-[0.6rem] font-bold ${STATUS_COLORS[status]}`}
                    >
                        {STATUS_LABELS[status]}
                    </span>
                </div>

                <div className="space-y-[0.4rem] text-[0.8rem]">
                    <div className="flex items-center justify-between">
                        <span className="text-[#777]">Mode</span>
                        <span className="text-[#232323] font-medium">
                            {MODE_LABELS[paymentMode]}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[#777]">
                            {role === "client" ? "Creator" : "Client"}
                        </span>
                        <span className="font-mono text-[0.7rem] text-[#777]">
                            {counterparty === "Awaiting creator"
                                ? counterparty
                                : `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`}
                        </span>
                    </div>
                    {deal.youtubeVideoId && (
                        <div className="flex items-center justify-between">
                            <span className="text-[#777]">Video</span>
                            <span className="text-[0.7rem] text-[#E62058]">
                                {deal.youtubeVideoId}
                            </span>
                        </div>
                    )}

                    {paymentMode === 0 && totalCount > 0 && (
                        <div className="pt-[0.4rem]">
                            <div className="flex items-center justify-between text-[0.7rem] text-[#777] mb-[0.2rem]">
                                <span>Milestone Progress</span>
                                <span>
                                    {paidCount} / {totalCount}
                                </span>
                            </div>
                            <div className="h-[0.3rem] rounded-full bg-[#f6f6f6]">
                                <div
                                    className="h-[0.3rem] rounded-full bg-[#E62058] transition-all"
                                    style={{
                                        width: `${(paidCount / totalCount) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {deal.totalDeposited > 0n && (
                        <div className="pt-[0.4rem]">
                            <div className="flex items-center justify-between text-[0.7rem] text-[#777] mb-[0.2rem]">
                                <span>Payment</span>
                                <span>
                                    {formatUnits(deal.totalPaid, 6)} /{" "}
                                    {formatUnits(deal.totalDeposited, 6)} USDC
                                </span>
                            </div>
                            <div className="h-[0.3rem] rounded-full bg-[#f6f6f6]">
                                <div
                                    className="h-[0.3rem] rounded-full bg-emerald-500 transition-all"
                                    style={{
                                        width: `${Math.min(100, (Number(deal.totalPaid) / Number(deal.totalDeposited)) * 100)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-[0.8rem] pt-[0.8rem] border-t border-[#c4c4c4]">
                    <span className="text-[0.7rem] text-[#777] group-hover:text-[#E62058] transition-colors duration-200">
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
            <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-[#a0a0a0] py-[3.2rem]">
                <p className="text-[#777]">No deals found</p>
                {role === "client" && (
                    <Link
                        href="/create-order"
                        className="mt-[0.4rem] text-[0.8rem] font-bold text-[#E62058] hover:text-[#c10f45] transition-colors duration-200"
                    >
                        Create your first order &rarr;
                    </Link>
                )}
                {role === "creator" && (
                    <Link
                        href="/marketplace"
                        className="mt-[0.4rem] text-[0.8rem] font-bold text-[#E62058] hover:text-[#c10f45] transition-colors duration-200"
                    >
                        Browse the marketplace &rarr;
                    </Link>
                )}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-[1.2rem] md:grid-cols-2 lg:grid-cols-3">
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

function MyApplications({ address }: { address: string }) {
    const [applications, setApplications] = useState<DealApplication[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        getApplicationsByCreator(address)
            .then(setApplications)
            .catch(() => {})
            .finally(() => setIsLoading(false));
    }, [address]);

    const pending = applications.filter((a) => a.status === "pending");

    if (isLoading) {
        return (
            <div className="space-y-[0.8rem]">
                {[0, 1].map((i) => (
                    <div
                        key={i}
                        className="animate-pulse rounded-[10px] border border-[#c4c4c4] bg-white p-[1.2rem]"
                    >
                        <div className="h-[0.8rem] w-[8rem] rounded-[6px] bg-[#f6f6f6]" />
                        <div className="mt-[0.4rem] h-[0.6rem] w-[5rem] rounded-[6px] bg-[#f6f6f6]" />
                    </div>
                ))}
            </div>
        );
    }

    if (pending.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-[#a0a0a0] py-[2.4rem]">
                <p className="text-[#777]">No pending applications</p>
                <Link
                    href="/marketplace"
                    className="mt-[0.4rem] text-[0.8rem] font-bold text-[#E62058] hover:text-[#c10f45] transition-colors duration-200"
                >
                    Browse the marketplace &rarr;
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-[0.8rem]">
            {pending.map((app) => (
                <Link key={app.id} href={`/order/${app.contract_deal_id}`}>
                    <div className="group rounded-[10px] border border-[#c4c4c4] bg-white p-[1.2rem] transition-all duration-300 hover:border-[#a0a0a0] hover:shadow-lg hover:shadow-[#E62058]/5 hover:-translate-y-[10px] cursor-pointer">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[0.8rem] font-bold text-[#232323]">
                                Order #{app.contract_deal_id}
                            </h4>
                            <span
                                className={`px-[0.6rem] py-[0.1rem] rounded-full text-[0.6rem] font-bold ${APP_STATUS_COLORS[app.status]}`}
                            >
                                {app.status}
                            </span>
                        </div>
                        {app.message && (
                            <p className="mt-[0.4rem] text-[0.7rem] text-[#777] line-clamp-2">
                                {app.message}
                            </p>
                        )}
                        <p className="mt-[0.2rem] text-[0.7rem] text-[#a0a0a0]">
                            Applied {new Date(app.created_at).toLocaleDateString()}
                        </p>
                    </div>
                </Link>
            ))}
        </div>
    );
}

export default function Dashboard() {
    const { address, isConnected } = useAccount();
    const { role } = useRole();

    const { data: nextDealId, isLoading } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "nextDealId",
    });

    const dealCount = nextDealId ? Number(nextDealId) : 0;

    if (!isConnected || !address) {
        return (
            <div className="flex flex-col items-center justify-center py-[4.8rem]">
                <div className="mb-[1.6rem] flex h-[4rem] w-[4rem] items-center justify-center rounded-full bg-[#f6f6f6] border border-[#c4c4c4]">
                    <svg
                        className="h-[2rem] w-[2rem] text-[#a0a0a0]"
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
                <h2 className="text-[1.4rem] font-bold text-[#232323]">
                    Connect Your Wallet
                </h2>
                <p className="mt-[0.4rem] text-[0.8rem] text-[#777]">
                    Connect your wallet to view your sponsorship deals
                </p>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-[2rem]">
                <h1 className="text-[2.4rem] leading-[2.7rem] font-bold text-[#232323]">Dashboard</h1>
                <p className="mt-[0.4rem] text-[0.95rem] text-[#777]">
                    {role === "creator"
                        ? "Your creator deals and applications"
                        : "Manage your sponsorship deals"}
                </p>
            </div>

            {role === "creator" && (
                <div className="mb-[2rem]">
                    <h2 className="mb-[1rem] text-[1.2rem] font-bold text-[#232323]">
                        My Applications
                    </h2>
                    <MyApplications address={address} />
                </div>
            )}

            <div>
                <h2 className="mb-[1rem] text-[1.2rem] font-bold text-[#232323]">
                    {role === "client" ? "My Orders" : "Accepted Deals"}
                </h2>
                {isLoading ? (
                    <div className="grid grid-cols-1 gap-[1.2rem] md:grid-cols-2 lg:grid-cols-3">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="animate-pulse rounded-[10px] border border-[#c4c4c4] bg-white p-[1.2rem]"
                            >
                                <div className="mb-[0.8rem] h-[1rem] w-[5rem] rounded-[6px] bg-[#f6f6f6]" />
                                <div className="space-y-[0.4rem]">
                                    <div className="h-[0.8rem] w-[8rem] rounded-[6px] bg-[#f6f6f6]" />
                                    <div className="h-[0.8rem] w-[7rem] rounded-[6px] bg-[#f6f6f6]" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <DealsList
                        role={role}
                        userAddress={address}
                        dealCount={dealCount}
                    />
                )}
            </div>
        </div>
    );
}
