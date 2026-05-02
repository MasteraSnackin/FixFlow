import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auth } from "@clerk/nextjs/server";
import {
  createPropertyWithUnits,
  isLocalDevDataMode,
  listPropertiesForLandlord,
} from "@/lib/local-dev-store";

// GET – list all properties with their units
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isLocalDevDataMode()) {
      return NextResponse.json({
        properties: listPropertiesForLandlord(userId),
      });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("properties")
      .select(`
        id, address, city, state, zip,
        units ( id, unit_label, tenant_id, tenant_name, tenant_phone )
      `)
      .eq("landlord_id", userId)
      .order("address", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch properties", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ properties: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST – create a new property with optional units
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { address, city, state, zip, units } = body;

    if (!address || !city || !state || !zip) {
      return NextResponse.json(
        { error: "address, city, state, and zip are required" },
        { status: 400 }
      );
    }

    if (isLocalDevDataMode()) {
      const result = createPropertyWithUnits({
        landlordId: userId,
        address,
        city,
        state,
        zip,
        units: Array.isArray(units) ? units : [],
      });

      return NextResponse.json(
        {
          success: true,
          property: {
            id: result.property.id,
            address,
            city,
            state,
            zip,
          },
          units: result.units,
        },
        { status: 201 }
      );
    }

    const supabase = createAdminClient();

    // 1. Create the property
    const { data: property, error: propError } = await supabase
      .from("properties")
      .insert({
        landlord_id: userId,
        address,
        city,
        state,
        zip,
        unit_count: Array.isArray(units) && units.length > 0 ? units.length : 1,
      })
      .select("id")
      .single();

    if (propError || !property) {
      return NextResponse.json(
        { error: "Failed to create property", details: propError?.message },
        { status: 500 }
      );
    }

    // 2. Create units if provided
    let createdUnits: any[] = [];
    if (units && Array.isArray(units) && units.length > 0) {
      const unitRows = units.map((u: any) => ({
        property_id: property.id,
        unit_label: u.unit_label || "Unit 1",
        tenant_name: u.tenant_name || null,
        tenant_phone: u.tenant_phone || null,
        tenant_id: u.tenant_id || null,
      }));

      const { data: insertedUnits, error: unitError } = await supabase
        .from("units")
        .insert(unitRows)
        .select("id, unit_label");

      if (unitError) {
        console.error("Failed to insert units:", unitError);
      } else {
        createdUnits = insertedUnits || [];
      }
    }

    return NextResponse.json(
      { success: true, property: { ...property, address, city, state, zip }, units: createdUnits },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
