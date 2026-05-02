import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkOrderSchema } from "@/lib/schemas";
import { getFixFlowLanguageModel } from "@/lib/ai/provider";

export async function POST(req: NextRequest) {
  try {
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    // Workflow-triggered internal calls do not carry user session cookies.
    // Use service-role access so this route can reliably read/write the request row.
    const supabase = createAdminClient();

    // 1. Fetch full maintenance request with nested unit and property relations
    const { data: request, error: fetchError } = await supabase
      .from("maintenance_requests")
      .select(`
        *,
        units (
          unit_label,
          tenant_name,
          tenant_phone,
          properties ( address )
        )
      `)
      .eq("id", requestId)
      .single();

    if (fetchError || !request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const propertyAddress = request.units?.properties?.address || "Unknown Address";
    const unitLabel = request.units?.unit_label || "Unknown Unit";
    const tenantName = request.units?.tenant_name || "Resident";
    const tenantPhone = request.units?.tenant_phone || "Not Provided";
    const diagnosis = request.diagnosis || {};
    const vetting = request.vetting || [];
    
    // Top contractor from vetting, or fallback
    const topContractor = vetting.length > 0 ? vetting[0] : (request.contractors?.[0] || { name: "Pending", phone: "N/A" });
    const costLow = request.estimated_cost_low || 0;
    const costHigh = request.estimated_cost_high || 0;

    // 2. Generate a work order via the configured AI provider using structured outputs
    const { object: workOrder } = await generateObject({
      model: getFixFlowLanguageModel(),
      schema: WorkOrderSchema,
      prompt: `Generate a professional work order for this maintenance dispatch:
      Property: ${propertyAddress}, ${unitLabel}
      Tenant: ${tenantName}, ${tenantPhone}
      Issue: ${diagnosis.description}
      Category: ${diagnosis.category}
      Severity: ${diagnosis.severity}/5
      Recommended action: ${diagnosis.recommended_action}
      Recommended contractor: ${topContractor.name}
      Phone: ${topContractor.phone}
      Estimated cost: £${costLow} - £${costHigh}
      Include 2 alternative contractors from this data if possible: ${JSON.stringify(vetting)}
      Write professional dispatch notes for the contractor.`
    });

    // 3. Auto-approval logic
    const urgency = String(diagnosis.urgency).toLowerCase();
    
    let isApproved = false;
    let newStatus = request.status || "diagnosed";

    if (costHigh <= 500 && costHigh > 0) {
      isApproved = true;
    }
    if (urgency === "emergency") {
      isApproved = true;
    }

    if (isApproved) {
      newStatus = "dispatched";
    }

    // 4. Save Work Order to DB
    const { error: updateError } = await supabase
      .from("maintenance_requests")
      .update({
        work_order: workOrder,
        assigned_contractor: topContractor,
        landlord_approved: isApproved,
        status: newStatus
      })
      .eq("id", requestId);

    if (updateError) {
      console.error("Failed to commit work order to database", updateError);
      return NextResponse.json({ error: "DB Update failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      work_order: workOrder,
      auto_approved: isApproved,
      new_status: newStatus
    });

  } catch (err: any) {
    console.error("Work Order API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
