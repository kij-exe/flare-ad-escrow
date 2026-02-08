import { supabase } from "./supabase";

export interface DealApplication {
    id: string;
    contract_deal_id: number;
    creator_address: string;
    message: string | null;
    status: "pending" | "accepted" | "rejected";
    created_at: string;
}

export async function getApplicationsForDeal(dealId: number): Promise<DealApplication[]> {
    const { data, error } = await supabase
        .from("deal_applications")
        .select("*")
        .eq("contract_deal_id", dealId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function getApplicationsByCreator(creatorAddress: string): Promise<DealApplication[]> {
    const { data, error } = await supabase
        .from("deal_applications")
        .select("*")
        .eq("creator_address", creatorAddress.toLowerCase())
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function submitApplication(
    dealId: number,
    creatorAddress: string,
    message: string
): Promise<DealApplication> {
    const { data, error } = await supabase
        .from("deal_applications")
        .insert({
            contract_deal_id: dealId,
            creator_address: creatorAddress.toLowerCase(),
            message: message || null,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateApplicationStatus(id: string, status: "accepted" | "rejected"): Promise<void> {
    const { error } = await supabase.from("deal_applications").update({ status }).eq("id", id);

    if (error) throw error;
}

export async function rejectRemainingApplications(dealId: number, exceptId: string): Promise<void> {
    const { error } = await supabase
        .from("deal_applications")
        .update({ status: "rejected" as const })
        .eq("contract_deal_id", dealId)
        .eq("status", "pending")
        .neq("id", exceptId);

    if (error) throw error;
}

export async function getApplicationCounts(dealIds: number[]): Promise<Record<number, number>> {
    if (dealIds.length === 0) return {};

    const { data, error } = await supabase
        .from("deal_applications")
        .select("contract_deal_id")
        .in("contract_deal_id", dealIds)
        .eq("status", "pending");

    if (error) throw error;

    const counts: Record<number, number> = {};
    for (const row of data ?? []) {
        counts[row.contract_deal_id] = (counts[row.contract_deal_id] || 0) + 1;
    }
    return counts;
}

// YouTube token storage

export async function saveYouTubeToken(dealId: number, accessToken: string): Promise<void> {
    const { error } = await supabase
        .from("youtube_tokens")
        .upsert({ contract_deal_id: dealId, access_token: accessToken });

    if (error) throw error;
}

export async function getYouTubeToken(dealId: number): Promise<string | null> {
    const { data, error } = await supabase
        .from("youtube_tokens")
        .select("access_token")
        .eq("contract_deal_id", dealId)
        .single();

    if (error || !data) return null;
    return data.access_token;
}
