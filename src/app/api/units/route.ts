import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocalDevDataMode, listUnitsForTenant } from "@/lib/local-dev-store";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isLocalDevDataMode()) {
      return NextResponse.json({ units: listUnitsForTenant(userId) });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("units")
      .select("id, unit_label")
      .eq("tenant_id", userId)
      .order("unit_label", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch units", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ units: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected error loading units",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
