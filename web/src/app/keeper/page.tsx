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
        <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"} ${connected ? "animate-pulse" : ""}`} />
            <span className="text-xs text-zinc-400">{connected ? "Connected" : "Disconnected"}</span>
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
                let color = "bg-zinc-700 text-zinc-500"; // pending
                if (isDone || i < currentIndex) {
                    color = "bg-emerald-900/50 text-emerald-400";
                } else if (isFailed && i <= currentIndex) {
                    color = "bg-red-900/50 text-red-400";
                } else if (i === currentIndex) {
                    color = "bg-blue-900/50 text-blue-300";
                }

                return (
                    <div key={step.key} className="flex items-center gap-1">
                        <div className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
                            {isDone && i <= currentIndex
                                ? "\u2713"
                                : isFailed && i === currentIndex
                                  ? "\u2717"
                                  : i === currentIndex
                                    ? "\u25CF"
                                    : "\u25CB"}{" "}
                            {step.label}
                        </div>
                        {i < CHECK_STEPS.length - 1 && <span className="text-zinc-700">&rarr;</span>}
                    </div>
                );
            })}
        </div>
    );
}

function ActiveCheckCard({ check }: { check: CheckState }) {
    const elapsed = Math.round((Date.now() - check.startedAt) / 1000);

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-zinc-100">Deal #{check.dealId}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${check.type === "viewcount" ? "bg-blue-900/50 text-blue-300 border border-blue-800" : "bg-amber-900/50 text-amber-300 border border-amber-800"}`}>
                        {check.type === "viewcount" ? "View Count" : "Etag"}
                    </span>
                </div>
                <span className="text-xs text-zinc-500">{elapsed}s elapsed</span>
            </div>

            <StepIndicator check={check} />

            {check.roundId && (
                <div className="mt-2">
                    <a
                        href={`https://coston2-systems-explorer.flare.rocks/voting-round/${check.roundId}?tab=fdc`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        View Round {check.roundId} on Explorer &nearr;
                    </a>
                </div>
            )}

            {check.result?.message && (
                <p className="mt-2 text-xs text-zinc-400">{check.result.message}</p>
            )}
        </div>
    );
}

function CompletedCheckRow({ check }: { check: CheckState }) {
    const time = new Date(check.completedAt || check.startedAt).toLocaleTimeString();
    const duration = check.completedAt ? Math.round((check.completedAt - check.startedAt) / 1000) : 0;
    const isFailed = check.status === "failed";

    return (
        <div className={`flex items-center justify-between py-3 border-b border-zinc-800/50 last:border-0 ${isFailed ? "opacity-75" : ""}`}>
            <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${isFailed ? "bg-red-500" : "bg-emerald-500"}`} />
                <span className="text-sm text-zinc-200">Deal #{check.dealId}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${check.type === "viewcount" ? "bg-blue-900/30 text-blue-400" : "bg-amber-900/30 text-amber-400"}`}>
                    {check.type}
                </span>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-xs text-zinc-400">{check.result?.message || check.error}</span>
                {check.result?.txHash && (
                    <a
                        href={`https://coston2-explorer.flare.network/tx/${check.result.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300"
                    >
                        TX &nearr;
                    </a>
                )}
                <span className="text-xs text-zinc-500">{duration}s</span>
                <span className="text-xs text-zinc-600">{time}</span>
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">Deal #{dealId}</h3>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-violet-900/50 text-violet-300 border border-violet-800">
                        {STATUS_LABELS[status]}
                    </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${paymentMode === 0 ? "bg-blue-900/30 text-blue-400" : "bg-violet-900/30 text-violet-400"}`}>
                    {MODE_LABELS[paymentMode]}
                </span>
            </div>

            {deal.youtubeVideoId && (
                <p className="text-xs text-zinc-400 mb-3">Video: {deal.youtubeVideoId}</p>
            )}

            <div className="flex gap-2">
                <button
                    onClick={() => api.checkDeal(dealId)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                >
                    Run Check
                </button>
                <button
                    onClick={() => api.checkEtag(dealId)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-medium text-zinc-300 hover:bg-zinc-700 border border-zinc-700 transition-colors"
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-zinc-100">Configuration</h2>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Cycle: {cycleCount}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs text-zinc-500 mb-1">Poll Interval (min)</label>
                    <input
                        type="number"
                        min="1"
                        value={pollMinutes}
                        onChange={(e) => setPollMinutes(e.target.value)}
                        onBlur={saveConfig}
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600"
                    />
                </div>
                <div>
                    <label className="block text-xs text-zinc-500 mb-1">Etag Check Every N Cycles</label>
                    <input
                        type="number"
                        min="1"
                        value={etagCycle}
                        onChange={(e) => setEtagCycle(e.target.value)}
                        onBlur={saveConfig}
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600"
                    />
                </div>
                <div className="flex items-end gap-2">
                    <button
                        onClick={() => api.togglePolling()}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isPolling
                                ? "bg-red-900/50 text-red-300 border border-red-800 hover:bg-red-900/80"
                                : "bg-emerald-900/50 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/80"
                        }`}
                    >
                        {isPolling ? "Stop Polling" : "Start Polling"}
                    </button>
                    <button
                        onClick={() => api.checkAll()}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
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
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50">Keeper Dashboard</h1>
                    <p className="mt-2 text-zinc-400">Monitor and control the FDC keeper bot</p>
                </div>
                <ConnectionIndicator connected={connected} />
            </div>

            {!connected && (
                <div className="mb-6 rounded-xl border border-amber-800/50 bg-amber-900/20 p-4">
                    <p className="text-sm text-amber-300">
                        Not connected to keeper server. Start it with:{" "}
                        <code className="bg-zinc-800 px-2 py-0.5 rounded text-xs">
                            yarn hardhat run scripts/trusttube/keeper/server.ts --network coston2
                        </code>
                    </p>
                </div>
            )}

            {/* Configuration */}
            {state && (
                <div className="mb-6">
                    <ConfigPanel
                        config={state.config}
                        isPolling={state.isPolling}
                        cycleCount={state.cycleCount}
                        api={api}
                    />
                </div>
            )}

            {/* Active Deals */}
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-zinc-100 mb-4">Active Deals</h2>
                {dealCount === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-800 py-12 flex flex-col items-center">
                        <p className="text-zinc-500">No deals found on-chain</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: dealCount }, (_, i) => (
                            <DealCard key={i} dealId={i} api={api} />
                        ))}
                    </div>
                )}
            </div>

            {/* Running Checks */}
            {activeChecks.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-lg font-semibold text-zinc-100 mb-4">
                        Running Checks ({activeChecks.length})
                    </h2>
                    <div className="space-y-3">
                        {activeChecks.map((check) => (
                            <ActiveCheckCard key={check.id} check={check} />
                        ))}
                    </div>
                </div>
            )}

            {/* Completed Checks */}
            <div>
                <h2 className="text-lg font-semibold text-zinc-100 mb-4">
                    Recent Checks {completedChecks.length > 0 && `(${completedChecks.length})`}
                </h2>
                {completedChecks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-800 py-12 flex flex-col items-center">
                        <p className="text-zinc-500">No completed checks yet</p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                        {completedChecks.map((check) => (
                            <CompletedCheckRow key={check.id} check={check} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
