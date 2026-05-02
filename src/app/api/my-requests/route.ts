import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocalDevDataMode, listRequestsForTenant } from "@/lib/local-dev-store";

// GET – list all requests for the currently authenticated tenant
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isLocalDevDataMode()) {
      return NextResponse.json({ requests: listRequestsForTenant(userId) });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("maintenance_requests")
      .select(`
        id, status, description, photo_url, created_at, updated_at,
        diagnosis, estimated_cost_low, estimated_cost_high,
        units ( unit_label, properties ( address, city ) )
      `)
      .eq("tenant_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch requests", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ requests: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
