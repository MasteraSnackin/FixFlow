import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase keys in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log("Fetching units...");
  const { data: units, error: unitError } = await supabase.from('units').select('id, tenant_id').limit(1);
  
  if (unitError || !units || units.length === 0) {
    console.warn("No units found to attach requests to. Please ensure you have at least one unit in the database.");
    return;
  }

  const unitId = units[0].id;
  const tenantId = units[0].tenant_id || "demo-tenant-123";

  console.log("Seeding Hackathon Demo Data...");

  const requests = [
    {
      unit_id: unitId,
      tenant_id: tenantId,
      description: "Window frame in the living room is jammed and won't close completely.",
      status: "submitted",
      photo_url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&q=80", 
      created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      estimated_cost_low: 450,
      estimated_cost_high: 650,
      landlord_approved: false,
      diagnosis: {
        category: "Structural",
        severity: 3,
        urgency: "Routine",
        description: "Window sash is misaligned or the balance mechanism has failed.",
        affected_system: "Living Room Window",
        recommended_action: "Repair or replace complete sash balance system. May require custom ordering.",
        tenant_safety_note: "Ensure the window is secured as much as possible to prevent drafts.",
        confidence: 0.82
      },
      contractors: [
        { name: "Glass & Glaziers Co.", rating: 4.6, distance_miles: 3.2, is_open_now: true },
        { name: "NYC Window Repair", rating: 4.5, distance_miles: 4.1, is_open_now: false }
      ],
      vetting: [
        { name: "Glass & Glaziers Co.", red_flags: ["Customer complaint about slow parts ordering"], typical_cost_estimate: "$500 - $700" }
      ]
    }
  ];

  for (const req of requests) {
    const { error } = await supabase.from('maintenance_requests').insert([req]);
    if (error) {
       console.error("Failed to insert row:", error);
    } else {
       console.log(`Inserted seeded request for ${req.diagnosis.affected_system}`);
    }
  }

  console.log("Seeding Complete!");
}

seed();
