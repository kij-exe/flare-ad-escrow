export type CheckType = "viewcount" | "etag";

export type CheckStatus =
    | "off-chain-check"
    | "preparing"
    | "submitting"
    | "waiting-round"
    | "retrieving-proof"
    | "claiming"
    | "completed"
    | "failed";

export interface CheckResult {
    txHash?: string;
    viewCount?: number;
    payout?: string;
    message?: string;
}

export interface CheckState {
    id: string;
    dealId: number;
    type: CheckType;
    status: CheckStatus;
    roundId?: number;
    startedAt: number;
    completedAt?: number;
    error?: string;
    result?: CheckResult;
}

export interface ServerConfig {
    pollIntervalMs: number;
    etagCheckCycle: number;
    pollingEnabled: boolean;
}

export interface ServerState {
    config: ServerConfig;
    activeChecks: Record<string, CheckState>;
    completedChecks: CheckState[];
    cycleCount: number;
    isPolling: boolean;
}

export enum DealStatus {
    Open = 0,
    InProgress = 1,
    InReview = 2,
    Active = 3,
    Completed = 4,
    Terminated = 5,
}

export enum PaymentMode {
    Milestone = 0,
    Linear = 1,
}
