import express from "express";
import cors from "cors";
import { SSEManager } from "./sse";
import { executeViewCountCheck, executeEtagCheck } from "./check-executor";
import type { CheckState, ServerConfig, ServerState } from "./types";
import { DealStatus } from "./types";

const TrustTube = artifacts.require("TrustTube");

// ─── Configuration ──────────────────────────────────────────

const TRUSTTUBE_ADDRESS = process.env.TRUSTTUBE_ADDRESS || "";
const PORT = parseInt(process.env.KEEPER_PORT || "3500", 10);
const MAX_CONCURRENT_CHECKS = 10;
const MAX_COMPLETED_HISTORY = 50;

// ─── State ──────────────────────────────────────────────────

const config: ServerConfig = {
    pollIntervalMs: 5 * 60 * 1000,
    etagCheckCycle: 6,
    pollingEnabled: false,
};

const activeChecks = new Map<string, CheckState>();
const completedChecks: CheckState[] = [];
let cycleCount = 0;
let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let checkIdCounter = 0;

const sse = new SSEManager();

// ─── Helpers ────────────────────────────────────────────────

function nextCheckId(): string {
    return `chk-${++checkIdCounter}`;
}

function getState(): ServerState {
    return {
        config,
        activeChecks: Object.fromEntries(activeChecks),
        completedChecks,
        cycleCount,
        isPolling: pollingTimer !== null,
    };
}

function finishCheck(check: CheckState) {
    activeChecks.delete(check.id);
    completedChecks.unshift(check);
    if (completedChecks.length > MAX_COMPLETED_HISTORY) {
        completedChecks.pop();
    }
    sse.broadcast("check-completed", check);
    sse.broadcast("state-update", getState());
}

async function getActiveDeals(trustTube: any): Promise<any[]> {
    const nextDealId = Number(await trustTube.nextDealId());
    const deals: any[] = [];

    for (let i = 0; i < nextDealId; i++) {
        try {
            const deal = await trustTube.getDeal(i);
            if (Number(deal.status) === (DealStatus.Active as number)) {
                deals.push(deal);
            }
        } catch (error) {
            console.log(`Error fetching deal ${i}:`, error);
        }
    }
    return deals;
}

// ─── Check Runners ──────────────────────────────────────────

function startViewCountCheck(trustTube: any, dealId: number, deal: any): string | null {
    if (activeChecks.size >= MAX_CONCURRENT_CHECKS) {
        return null;
    }

    const id = nextCheckId();
    const check: CheckState = {
        id,
        dealId,
        type: "viewcount",
        status: "off-chain-check",
        startedAt: Date.now(),
    };

    activeChecks.set(id, check);
    sse.broadcast("check-created", check);

    executeViewCountCheck(trustTube, dealId, deal, (update) => {
        Object.assign(check, update);
        sse.broadcast("check-updated", check);
    })
        .then(() => {
            if (check.status !== "completed") {
                check.status = "completed";
                check.completedAt = Date.now();
            }
            finishCheck(check);
        })
        .catch((error) => {
            console.error(`[server] View check failed for deal #${dealId}:`, error.message || error);
            check.status = "failed";
            check.error = error.message || String(error);
            check.completedAt = Date.now();
            finishCheck(check);
        });

    return id;
}

function startEtagCheck(trustTube: any, dealId: number, deal: any): string | null {
    if (activeChecks.size >= MAX_CONCURRENT_CHECKS) {
        return null;
    }

    const id = nextCheckId();
    const check: CheckState = {
        id,
        dealId,
        type: "etag",
        status: "preparing",
        startedAt: Date.now(),
    };

    activeChecks.set(id, check);
    sse.broadcast("check-created", check);

    executeEtagCheck(trustTube, dealId, deal, (update) => {
        Object.assign(check, update);
        sse.broadcast("check-updated", check);
    })
        .then(() => {
            if (check.status !== "completed") {
                check.status = "completed";
                check.completedAt = Date.now();
            }
            finishCheck(check);
        })
        .catch((error) => {
            console.error(`[server] Etag check failed for deal #${dealId}:`, error.message || error);
            check.status = "failed";
            check.error = error.message || String(error);
            check.completedAt = Date.now();
            finishCheck(check);
        });

    return id;
}

// ─── Polling Loop ───────────────────────────────────────────

async function runPollCycle(trustTube: any) {
    cycleCount++;
    console.log(`\n=== Poll Cycle ${cycleCount} (${new Date().toISOString()}) ===\n`);
    sse.broadcast("state-update", getState());

    try {
        const deals = await getActiveDeals(trustTube);
        console.log(`Found ${deals.length} active deal(s).\n`);

        if (deals.length === 0) return;

        // View count checks for all active deals
        for (const deal of deals) {
            startViewCountCheck(trustTube, Number(deal.id), deal);
        }

        // Etag checks every Nth cycle
        if (cycleCount % config.etagCheckCycle === 0) {
            console.log("Running etag checks this cycle.\n");
            for (const deal of deals) {
                startEtagCheck(trustTube, Number(deal.id), deal);
            }
        }
    } catch (error) {
        console.log("Error in poll cycle:", error);
    }
}

function startPolling(trustTube: any) {
    if (pollingTimer) return;

    const poll = async () => {
        await runPollCycle(trustTube);
        if (config.pollingEnabled) {
            pollingTimer = setTimeout(() => void poll(), config.pollIntervalMs);
        }
    };

    config.pollingEnabled = true;
    void poll();
}

function stopPolling() {
    config.pollingEnabled = false;
    if (pollingTimer) {
        clearTimeout(pollingTimer);
        pollingTimer = null;
    }
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
    if (!TRUSTTUBE_ADDRESS) {
        throw new Error("TRUSTTUBE_ADDRESS environment variable is required.");
    }

    const trustTube = await TrustTube.at(TRUSTTUBE_ADDRESS);
    console.log(`Connected to TrustTube at ${TRUSTTUBE_ADDRESS}\n`);

    const app = express();
    app.use(cors({ origin: "http://localhost:3000" }));
    app.use(express.json());

    // ─── REST Routes ────────────────────────────────────────

    app.get("/api/status", (_req, res) => {
        res.json(getState());
    });

    app.post("/api/config", (req, res) => {
        const { pollIntervalMs, etagCheckCycle } = req.body;
        if (pollIntervalMs !== undefined) config.pollIntervalMs = Number(pollIntervalMs);
        if (etagCheckCycle !== undefined) config.etagCheckCycle = Number(etagCheckCycle);
        sse.broadcast("state-update", getState());
        res.json({ ok: true, config });
    });

    app.post("/api/check/:dealId", (req, res) => {
        void (async () => {
            const dealId = Number(req.params.dealId);
            try {
                const deal = await trustTube.getDeal(dealId);
                const id = startViewCountCheck(trustTube, dealId, deal);
                if (!id) {
                    res.status(429).json({ error: "Max concurrent checks reached" });
                    return;
                }
                res.json({ ok: true, checkId: id });
            } catch (error: any) {
                res.status(400).json({ error: error.message || String(error) });
            }
        })();
    });

    app.post("/api/check-etag/:dealId", (req, res) => {
        void (async () => {
            const dealId = Number(req.params.dealId);
            try {
                const deal = await trustTube.getDeal(dealId);
                const id = startEtagCheck(trustTube, dealId, deal);
                if (!id) {
                    res.status(429).json({ error: "Max concurrent checks reached" });
                    return;
                }
                res.json({ ok: true, checkId: id });
            } catch (error: any) {
                res.status(400).json({ error: error.message || String(error) });
            }
        })();
    });

    app.post("/api/check-all", (_req, res) => {
        void (async () => {
            try {
                const deals = await getActiveDeals(trustTube);
                const checkIds: string[] = [];
                for (const deal of deals) {
                    const id = startViewCountCheck(trustTube, Number(deal.id), deal);
                    if (id) checkIds.push(id);
                }
                res.json({ ok: true, checkIds, dealCount: deals.length });
            } catch (error: any) {
                res.status(500).json({ error: error.message || String(error) });
            }
        })();
    });

    app.post("/api/toggle-polling", (_req, res) => {
        if (config.pollingEnabled) {
            stopPolling();
        } else {
            startPolling(trustTube);
        }
        sse.broadcast("state-update", getState());
        res.json({ ok: true, pollingEnabled: config.pollingEnabled });
    });

    // ─── SSE ────────────────────────────────────────────────

    app.get("/api/events", (req, res) => {
        sse.addClient(res);
        // Send initial state
        const payload = `event: state-update\ndata: ${JSON.stringify(getState())}\n\n`;
        res.write(payload);
    });

    // ─── Start ──────────────────────────────────────────────

    app.listen(PORT, () => {
        console.log(`\n=== Keeper Dashboard Server ===`);
        console.log(`Listening on http://localhost:${PORT}`);
        console.log(`SSE endpoint: http://localhost:${PORT}/api/events`);
        console.log(
            `API docs: GET /api/status, POST /api/config, POST /api/check/:dealId, POST /api/check-all, POST /api/toggle-polling\n`
        );
    });
}

void main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

// yarn hardhat run scripts/trusttube/keeper/server.ts --network coston2
