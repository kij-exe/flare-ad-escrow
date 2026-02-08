"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useReadContract } from "wagmi";
import { TRUSTTUBE_ABI, TRUSTTUBE_ADDRESS } from "@/config/contracts";

// ─── Types (mirrors backend types.ts) ───────────────────────

interface CheckResult {
    txHash?: string;
    viewCount?: number;
    payout?: string;
    message?: string;
}

interface CheckState {
    id: string;
    dealId: number;
    type: "viewcount" | "etag";
    status: string;
    roundId?: number;
    startedAt: number;
    completedAt?: number;
    error?: string;
    result?: CheckResult;
}

interface ServerConfig {
    pollIntervalMs: number;
    etagCheckCycle: number;
    pollingEnabled: boolean;
}

interface ServerState {
    config: ServerConfig;
    activeChecks: Record<string, CheckState>;
    completedChecks: CheckState[];
    cycleCount: number;
    isPolling: boolean;
}

// ─── Constants ──────────────────────────────────────────────

const KEEPER_API_URL = process.env.NEXT_PUBLIC_KEEPER_API_URL || "http://localhost:3500";

const STATUS_LABELS = ["Open", "In Progress", "In Review", "Active", "Completed", "Terminated"];
const MODE_LABELS = ["Milestone", "Linear"];

const CHECK_STEPS = [
    { key: "off-chain-check", label: "Off-chain" },
    { key: "preparing", label: "Prepare" },
    { key: "submitting", label: "Submit" },
    { key: "waiting-round", label: "Waiting" },
    { key: "retrieving-proof", label: "Proof" },
    { key: "claiming", label: "Claim" },
];

// ─── Hooks ──────────────────────────────────────────────────

function useKeeperSSE() {
    const [state, setState] = useState<ServerState | null>(null);
    const [connected, setConnected] = useState(false);
    const activeChecksRef = useRef<Map<string, CheckState>>(new Map());
    const completedChecksRef = useRef<CheckState[]>([]);

    useEffect(() => {
        let es: EventSource | null = null;
        let retryTimer: ReturnType<typeof setTimeout>;

        function connect() {
            es = new EventSource(`${KEEPER_API_URL}/api/events`);

            es.addEventListener("state-update", (e) => {
                const data: ServerState = JSON.parse(e.data);
                activeChecksRef.current = new Map(Object.entries(data.activeChecks));
                completedChecksRef.current = data.completedChecks;
                setState(data);
                setConnected(true);
            });

            es.addEventListener("check-created", (e) => {
                const check: CheckState = JSON.parse(e.data);
                activeChecksRef.current.set(check.id, check);
                setState((prev) =>
                    prev
                        ? {
                              ...prev,
                              activeChecks: Object.fromEntries(activeChecksRef.current),
                          }
                        : prev
                );
            });

            es.addEventListener("check-updated", (e) => {
                const check: CheckState = JSON.parse(e.data);
                activeChecksRef.current.set(check.id, check);
                setState((prev) =>
                    prev
                        ? {
                              ...prev,
                              activeChecks: Object.fromEntries(activeChecksRef.current),
                          }
                        : prev
                );
            });

            es.addEventListener("check-completed", (e) => {
                const check: CheckState = JSON.parse(e.data);
                activeChecksRef.current.delete(check.id);
                completedChecksRef.current = [check, ...completedChecksRef.current].slice(0, 50);
                setState((prev) =>
                    prev
                        ? {
                              ...prev,
                              activeChecks: Object.fromEntries(activeChecksRef.current),
                              completedChecks: completedChecksRef.current,
                          }
                        : prev
                );
            });

            es.onerror = () => {
                setConnected(false);
                es?.close();
                retryTimer = setTimeout(connect, 3000);
            };
        }

        connect();

        return () => {
            es?.close();
            clearTimeout(retryTimer);
        };
    }, []);

    return { state, connected };
}

function useKeeperAPI() {
    const post = useCallback(async (path: string, body?: any) => {
        const res = await fetch(`${KEEPER_API_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
        });
        return res.json();
    }, []);

    return {
        updateConfig: (config: Partial<ServerConfig>) => post("/api/config", config),
        checkDeal: (dealId: number) => post(`/api/check/${dealId}`),
        checkEtag: (dealId: number) => post(`/api/check-etag/${dealId}`),
        checkAll: () => post("/api/check-all"),
        togglePolling: () => post("/api/toggle-polling"),
    };
}

// ─── Components ─────────────────────────────────────────────

function ConnectionIndicator({ connected }: { connected: boolean }) {
    return (
        <div className="flex items-center gap-[0.5rem]">
            <div className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"} ${connected ? "animate-pulse" : ""}`} />
            <span className="text-[0.7rem] text-[#777]">{connected ? "Connected" : "Disconnected"}</span>
        </div>
    );
}

function StepIndicator({ check }: { check: CheckState }) {
    const currentIndex = CHECK_STEPS.findIndex((s) => s.key === check.status);
    const isDone = check.status === "completed";
    const isFailed = check.status === "failed";

    return (
        <div className="flex items-center gap-1">
            {CHECK_STEPS.map((step, i) => {
                let color = "bg-[#f6f6f6] text-[#a0a0a0]"; // pending
                if (isDone || i < currentIndex) {
                    color = "bg-emerald-50 text-emerald-600";
                } else if (isFailed && i <= currentIndex) {
                    color = "bg-red-50 text-red-600";
                } else if (i === currentIndex) {
                    color = "bg-[#fff1f3] text-[#E62058]";
                }

                return (
                    <div key={step.key} className="flex items-center gap-1">
                        <div className={`px-2 py-0.5 rounded-[6px] text-[0.6rem] font-bold ${color}`}>
                            {isDone && i <= currentIndex
                                ? "\u2713"
                                : isFailed && i === currentIndex
                                  ? "\u2717"
                                  : i === currentIndex
                                    ? "\u25CF"
                                    : "\u25CB"}{" "}
                            {step.label}
                        </div>
                        {i < CHECK_STEPS.length - 1 && <span className="text-[#a0a0a0]">&rarr;</span>}
                    </div>
                );
            })}
        </div>
    );
}

function ActiveCheckCard({ check }: { check: CheckState }) {
    const elapsed = Math.round((Date.now() - check.startedAt) / 1000);

    return (
        <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.2rem]">
            <div className="flex items-center justify-between mb-[0.8rem]">
                <div className="flex items-center gap-[0.8rem]">
                    <h3 className="text-[0.8rem] font-bold text-[#232323]">Deal #{check.dealId}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-bold ${check.type === "viewcount" ? "bg-[#fff1f3] text-[#E62058] border border-[#ffccd5]" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                        {check.type === "viewcount" ? "View Count" : "Etag"}
                    </span>
                </div>
                <span className="text-[0.7rem] text-[#a0a0a0]">{elapsed}s elapsed</span>
            </div>

            <StepIndicator check={check} />

            {check.roundId && (
                <div className="mt-[0.5rem]">
                    <a
                        href={`https://coston2-systems-explorer.flare.rocks/voting-round/${check.roundId}?tab=fdc`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[0.7rem] text-[#E62058] hover:text-[#c10f45] transition-all duration-200"
                    >
                        View Round {check.roundId} on Explorer &nearr;
                    </a>
                </div>
            )}

            {check.result?.message && (
                <p className="mt-[0.5rem] text-[0.7rem] text-[#777]">{check.result.message}</p>
            )}
        </div>
    );
}

function CompletedCheckRow({ check }: { check: CheckState }) {
    const time = new Date(check.completedAt || check.startedAt).toLocaleTimeString();
    const duration = check.completedAt ? Math.round((check.completedAt - check.startedAt) / 1000) : 0;
    const isFailed = check.status === "failed";

    return (
        <div className={`flex items-center justify-between py-[0.8rem] border-b border-[#c4c4c4] last:border-0 ${isFailed ? "opacity-75" : ""}`}>
            <div className="flex items-center gap-[0.8rem]">
                <span className={`h-2 w-2 rounded-full ${isFailed ? "bg-red-500" : "bg-emerald-500"}`} />
                <span className="text-[0.8rem] text-[#232323]">Deal #{check.dealId}</span>
                <span className={`px-2 py-0.5 rounded-[6px] text-[0.6rem] font-bold ${check.type === "viewcount" ? "bg-[#fff1f3] text-[#E62058]" : "bg-amber-50 text-amber-700"}`}>
                    {check.type}
                </span>
            </div>
            <div className="flex items-center gap-[1rem]">
                <span className="text-[0.7rem] text-[#777]">{check.result?.message || check.error}</span>
                {check.result?.txHash && (
                    <a
                        href={`https://coston2-explorer.flare.network/tx/${check.result.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[0.7rem] text-[#E62058] hover:text-[#c10f45] transition-all duration-200"
                    >
                        TX &nearr;
                    </a>
                )}
                <span className="text-[0.7rem] text-[#a0a0a0]">{duration}s</span>
                <span className="text-[0.7rem] text-[#a0a0a0]">{time}</span>
            </div>
        </div>
    );
}

function DealCard({ dealId, api }: { dealId: number; api: ReturnType<typeof useKeeperAPI> }) {
    const { data: deal } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "getDeal",
        args: [BigInt(dealId)],
    });

    if (!deal) return null;

    const status = Number(deal.status);
    // Only show Active deals
    if (status !== 3) return null;

    const paymentMode = Number(deal.paymentMode);

    return (
        <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.2rem]">
            <div className="flex items-center justify-between mb-[0.8rem]">
                <div className="flex items-center gap-[0.5rem]">
                    <h3 className="text-[0.8rem] font-bold text-[#232323]">Deal #{dealId}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                        {STATUS_LABELS[status]}
                    </span>
                </div>
                <span className={`text-[0.6rem] font-bold px-2 py-0.5 rounded-[6px] ${paymentMode === 0 ? "bg-[#fff1f3] text-[#E62058]" : "bg-violet-50 text-violet-700"}`}>
                    {MODE_LABELS[paymentMode]}
                </span>
            </div>

            {deal.youtubeVideoId && (
                <p className="text-[0.7rem] text-[#777] mb-[0.8rem]">Video: {deal.youtubeVideoId}</p>
            )}

            <div className="flex gap-[0.5rem]">
                <button
                    onClick={() => api.checkDeal(dealId)}
                    className="px-[1rem] py-[0.5rem] rounded-[6px] bg-[#E62058] text-[0.7rem] font-bold text-white hover:bg-[#c10f45] active:scale-95 transition-all duration-200"
                >
                    Run Check
                </button>
                <button
                    onClick={() => api.checkEtag(dealId)}
                    className="px-[1rem] py-[0.5rem] rounded-[6px] bg-[#f6f6f6] text-[0.7rem] font-bold text-[#232323] hover:bg-[#ffe4e8] border border-[#a0a0a0] transition-all duration-200"
                >
                    Check Etag
                </button>
            </div>
        </div>
    );
}

function ConfigPanel({
    config,
    isPolling,
    cycleCount,
    api,
}: {
    config: ServerConfig;
    isPolling: boolean;
    cycleCount: number;
    api: ReturnType<typeof useKeeperAPI>;
}) {
    const [pollMinutes, setPollMinutes] = useState(String(config.pollIntervalMs / 60000));
    const [etagCycle, setEtagCycle] = useState(String(config.etagCheckCycle));

    useEffect(() => {
        setPollMinutes(String(config.pollIntervalMs / 60000));
        setEtagCycle(String(config.etagCheckCycle));
    }, [config]);

    const saveConfig = () => {
        api.updateConfig({
            pollIntervalMs: Number(pollMinutes) * 60000,
            etagCheckCycle: Number(etagCycle),
        });
    };

    return (
        <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.6rem]">
            <div className="flex items-center justify-between mb-[1.2rem]">
                <h2 className="text-[1.2rem] font-bold text-[#232323]">Configuration</h2>
                <div className="flex items-center gap-[0.5rem]">
                    <span className="text-[0.7rem] text-[#a0a0a0]">Cycle: {cycleCount}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[1.2rem]">
                <div>
                    <label className="block text-[0.7rem] text-[#777] mb-[0.3rem]">Poll Interval (min)</label>
                    <input
                        type="number"
                        min="1"
                        value={pollMinutes}
                        onChange={(e) => setPollMinutes(e.target.value)}
                        onBlur={saveConfig}
                        className="w-full rounded-[6px] bg-[#f6f6f6] border border-[#a0a0a0] px-[0.8rem] py-[0.5rem] text-[0.8rem] text-[#232323] focus:outline-none focus:border-[#E62058]"
                    />
                </div>
                <div>
                    <label className="block text-[0.7rem] text-[#777] mb-[0.3rem]">Etag Check Every N Cycles</label>
                    <input
                        type="number"
                        min="1"
                        value={etagCycle}
                        onChange={(e) => setEtagCycle(e.target.value)}
                        onBlur={saveConfig}
                        className="w-full rounded-[6px] bg-[#f6f6f6] border border-[#a0a0a0] px-[0.8rem] py-[0.5rem] text-[0.8rem] text-[#232323] focus:outline-none focus:border-[#E62058]"
                    />
                </div>
                <div className="flex items-end gap-[0.5rem]">
                    <button
                        onClick={() => api.togglePolling()}
                        className={`px-[1rem] py-[0.5rem] rounded-[6px] text-[0.7rem] font-bold transition-all duration-200 ${
                            isPolling
                                ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                        }`}
                    >
                        {isPolling ? "Stop Polling" : "Start Polling"}
                    </button>
                    <button
                        onClick={() => api.checkAll()}
                        className="px-[1rem] py-[0.5rem] rounded-[6px] bg-[#E62058] text-[0.7rem] font-bold text-white hover:bg-[#c10f45] active:scale-95 transition-all duration-200"
                    >
                        Check All Now
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────

export default function KeeperPage() {
    const { state, connected } = useKeeperSSE();
    const api = useKeeperAPI();

    const { data: nextDealId } = useReadContract({
        address: TRUSTTUBE_ADDRESS as `0x${string}`,
        abi: TRUSTTUBE_ABI,
        functionName: "nextDealId",
        query: { refetchInterval: 10000 },
    });

    const dealCount = nextDealId ? Number(nextDealId) : 0;
    const activeChecks = state ? Object.values(state.activeChecks) : [];
    const completedChecks = state?.completedChecks || [];

    return (
        <div>
            {/* Header */}
            <div className="mb-[1.6rem] flex items-center justify-between">
                <div>
                    <h1 className="text-[2.4rem] leading-[2.7rem] font-bold text-[#232323]">Keeper Dashboard</h1>
                    <p className="mt-[0.5rem] text-[0.8rem] text-[#777]">Monitor and control the FDC keeper bot</p>
                </div>
                <ConnectionIndicator connected={connected} />
            </div>

            {!connected && (
                <div className="mb-[1.6rem] rounded-[10px] border border-amber-200 bg-amber-50 p-[1.2rem]">
                    <p className="text-[0.8rem] text-amber-700">
                        Not connected to keeper server. Start it with:{" "}
                        <code className="bg-[#f6f6f6] px-[0.5rem] py-[0.15rem] rounded-[6px] text-[0.7rem]">
                            yarn hardhat run scripts/trusttube/keeper/server.ts --network coston2
                        </code>
                    </p>
                </div>
            )}

            {/* Configuration */}
            {state && (
                <div className="mb-[1.6rem]">
                    <ConfigPanel
                        config={state.config}
                        isPolling={state.isPolling}
                        cycleCount={state.cycleCount}
                        api={api}
                    />
                </div>
            )}

            {/* Active Deals */}
            <div className="mb-[1.6rem]">
                <h2 className="text-[1.2rem] font-bold text-[#232323] mb-[1.2rem]">Active Deals</h2>
                {dealCount === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-[#c4c4c4] py-[3rem] flex flex-col items-center">
                        <p className="text-[0.8rem] text-[#a0a0a0]">No deals found on-chain</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-[1.2rem] md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: dealCount }, (_, i) => (
                            <DealCard key={i} dealId={i} api={api} />
                        ))}
                    </div>
                )}
            </div>

            {/* Running Checks */}
            {activeChecks.length > 0 && (
                <div className="mb-[1.6rem]">
                    <h2 className="text-[1.2rem] font-bold text-[#232323] mb-[1.2rem]">
                        Running Checks ({activeChecks.length})
                    </h2>
                    <div className="space-y-[0.8rem]">
                        {activeChecks.map((check) => (
                            <ActiveCheckCard key={check.id} check={check} />
                        ))}
                    </div>
                </div>
            )}

            {/* Completed Checks */}
            <div>
                <h2 className="text-[1.2rem] font-bold text-[#232323] mb-[1.2rem]">
                    Recent Checks {completedChecks.length > 0 && `(${completedChecks.length})`}
                </h2>
                {completedChecks.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-[#c4c4c4] py-[3rem] flex flex-col items-center">
                        <p className="text-[0.8rem] text-[#a0a0a0]">No completed checks yet</p>
                    </div>
                ) : (
                    <div className="rounded-[10px] border border-[#c4c4c4] bg-white p-[1.2rem]">
                        {completedChecks.map((check) => (
                            <CompletedCheckRow key={check.id} check={check} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
