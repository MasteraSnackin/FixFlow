import { NextRequest, NextResponse } from "next/server";
import { vetLiveContractors } from "@/lib/ai/contractor-intelligence";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { requestId, contractors, repairType, city } = await req.json();

    if (!requestId || !contractors || !repairType || !city) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const vettedResults = await vetLiveContractors({
      contractors,
      repairType,
      city,
    });

    const topContractor = vettedResults[0];
    const supabase = createAdminClient();

    const { error: dbError } = await supabase
      .from("maintenance_requests")
      .update({
        vetting: vettedResults,
        estimated_cost_low:
          topContractor && topContractor.estimated_cost_low > 0
            ? topContractor.estimated_cost_low
            : null,
        estimated_cost_high:
          topContractor && topContractor.estimated_cost_high > 0
            ? topContractor.estimated_cost_high
            : null,
      })
      .eq("id", requestId);

    if (dbError) {
      console.error("DB Error updating vetting:", dbError);
      return NextResponse.json(
        { error: "Failed to update record" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, vetting: vettedResults });
  } catch (err: any) {
    console.error("Vetting API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
