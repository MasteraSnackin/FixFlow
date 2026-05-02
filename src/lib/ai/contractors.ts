import {
  assertCategory,
  discoverLiveContractors,
} from "@/lib/ai/contractor-intelligence";
import { createAdminClient } from "@/lib/supabase/admin";
import { type Contractor } from "@/lib/schemas";

export async function discoverContractors(
  requestId: string,
  category: string,
  address: string,
  isEmergency: boolean = false
): Promise<Contractor[]> {
  assertCategory(category);

  const contractors = await discoverLiveContractors(
    category,
    address,
    isEmergency
  );

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({
      contractors,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    throw new Error(
      `Failed to update contractors for request ${requestId}: ${error.message}`
    );
  }

  return contractors;
}
