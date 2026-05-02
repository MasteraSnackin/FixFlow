import { NextResponse } from "next/server";
import { discoverContractors } from "@/lib/ai/contractors";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ContractorsRequest,
  ContractorsResponse,
  ApiError,
} from "@/lib/api-types";
import { ISSUE_CATEGORIES } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ContractorsRequest;

    if (!body.requestId || !body.category || !body.address) {
      return NextResponse.json(
        {
          error: "requestId, category, and address are required",
        } satisfies ApiError,
        { status: 400 }
      );
    }

    if (!ISSUE_CATEGORIES.includes(body.category as (typeof ISSUE_CATEGORIES)[number])) {
      return NextResponse.json(
        {
          error: `Invalid category. Must be one of: ${ISSUE_CATEGORIES.join(", ")}`,
        } satisfies ApiError,
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: request } = await supabase
      .from("maintenance_requests")
      .select("diagnosis")
      .eq("id", body.requestId)
      .single();

    const isEmergency =
      request?.diagnosis &&
      typeof request.diagnosis === "object" &&
      (request.diagnosis as Record<string, unknown>).urgency === "emergency";

    const contractors = await discoverContractors(
      body.requestId,
      body.category,
      body.address,
      isEmergency
    );

    return NextResponse.json({ contractors } satisfies ContractorsResponse);
  } catch (error) {
    console.error("[/api/contractors] Error:", error);
    return NextResponse.json(
      {
        error: "Contractor discovery failed",
        details: error instanceof Error ? error.message : String(error),
      } satisfies ApiError,
      { status: 500 }
    );
  }
}
