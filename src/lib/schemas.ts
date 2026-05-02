import { z } from "zod";

export const ISSUE_CATEGORIES = [
  "plumbing",
  "electrical",
  "hvac",
  "structural",
  "appliance",
  "pest",
  "cosmetic",
] as const;

export const URGENCY_LEVELS = ["low", "medium", "high", "emergency"] as const;

export const REQUEST_STATUSES = [
  "submitted",
  "diagnosed",
  "dispatched",
  "in_progress",
  "resolved",
] as const;

export const DiagnosisSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  severity: z.number().int().min(1).max(5),
  urgency: z.enum(URGENCY_LEVELS),
  description: z.string(),
  affected_system: z.string(),
  recommended_action: z.string(),
  tenant_safety_note: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;

export const ContractorSchema = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  rating: z.number().min(0).max(5),
  total_reviews: z.number().int(),
  distance_miles: z.number(),
  hours_today: z.string(),
  is_open_now: z.boolean(),
  maps_url: z.string(),
});

export type Contractor = z.infer<typeof ContractorSchema>;

export const VettingSchema = z.object({
  review_summary: z.string().describe("A 2-3 sentence summary of online reviews for this contractor."),
  red_flags: z.array(z.string()).describe("List of any complaints, lawsuits, or licensing issues found. Empty array if none."),
  estimated_cost_low: z.number().describe("The low end of the estimated cost range in GBP for this repair type in this city."),
  estimated_cost_high: z.number().describe("The high end of the estimated cost range in GBP for this repair type in this city."),
  sources: z.array(z.string().url()).describe("List of valid source URLs used to find this information.")
});

export type Vetting = z.infer<typeof VettingSchema>;

export const WorkOrderSchema = z.object({
  property_address: z.string(),
  unit_label: z.string(),
  tenant_name: z.string(),
  tenant_phone: z.string(),
  issue_description: z.string(),
  category: z.string(),
  severity: z.number().min(1).max(5),
  recommended_action: z.string(),
  assigned_contractor_name: z.string(),
  assigned_contractor_phone: z.string(),
  estimated_cost_range: z.string().describe("Formatted string like '£150 - £300'"),
  alternative_contractors: z.array(z.object({
    name: z.string(),
    phone: z.string()
  })),
  dispatch_notes: z.string().describe("Professional notes for the dispatched contractor.")
});

export type WorkOrder = z.infer<typeof WorkOrderSchema>;
