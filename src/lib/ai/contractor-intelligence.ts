import { generateObject, generateText } from "ai";
import { z } from "zod";
import {
  ContractorSchema,
  ISSUE_CATEGORIES,
  type Contractor,
  type Diagnosis,
  type Vetting,
  VettingSchema,
} from "@/lib/schemas";
import {
  getFixFlowContractorDiscoveryTools,
  getFixFlowLanguageModel,
  getFixFlowSearchTools,
} from "@/lib/ai/provider";
import {
  formatBrightDataDiscoverResults,
  getFixFlowWebProvider,
  runBrightDataDiscover,
} from "@/lib/brightdata";

export type VettedContractor = Contractor & Vetting;

const VALID_CATEGORIES = new Set<string>(ISSUE_CATEGORIES);

export const ContractorQuoteEstimateSchema = z.object({
  contractor_quote: z
    .string()
    .describe(
      "A concise AI-generated estimate in plain English. Be explicit that it is an estimate, not a confirmed contractor reply."
    ),
  contractor_quote_confidence: z.number().min(0).max(1),
});

export function assertCategory(category: string): asserts category is Diagnosis["category"] {
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`Unsupported diagnosis category "${category}"`);
  }
}

function categoryToSearchTerm(category: string) {
  const map: Record<string, string> = {
    plumbing: "local plumber",
    electrical: "NICEIC electrician",
    hvac: "boiler and heating engineer",
    structural: "property repair contractor",
    appliance: "appliance repair engineer",
    pest: "pest control service",
    cosmetic: "handyman service",
  };

  return map[category] ?? `${category} contractor`;
}

function parseCityFromAddress(address: string) {
  const cityMatch = address.match(/,\s*([^,]+)(?:,|\s+[A-Z]{1,3}\d)/);
  return cityMatch?.[1]?.trim() || "London";
}

function deduplicateContractors(contractors: Contractor[]) {
  const seen = new Set<string>();
  return contractors.filter((contractor) => {
    const key = contractor.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortContractors(contractors: Contractor[]) {
  return [...contractors].sort((a, b) => {
    if (a.is_open_now !== b.is_open_now) return a.is_open_now ? -1 : 1;
    return b.rating - a.rating;
  });
}

function parseVettingPayload(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return VettingSchema.parse(JSON.parse(candidate));
    } catch {
      // Try the next parsing strategy.
    }
  }

  throw new Error("Could not parse grounded vetting result as JSON");
}

function parseGroundedJson<T>(text: string, schema: z.ZodType<T>) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return schema.parse(JSON.parse(candidate));
    } catch {
      // Try the next parsing strategy.
    }
  }

  throw new Error("Could not parse grounded JSON payload");
}

async function findContractorsWithProviderTools(
  category: Diagnosis["category"],
  address: string,
  radiusMiles: number
) {
  const searchTerm = categoryToSearchTerm(category);
  const city = parseCityFromAddress(address);

  const { text } = await generateText({
    model: getFixFlowLanguageModel(),
    tools: getFixFlowContractorDiscoveryTools({
      city,
      region: "England",
      country: "GB",
      maxUses: 4,
    }),
    prompt: `Find UK-based ${searchTerm} contractors within ${radiusMiles} miles of ${address}.

For each contractor, provide:
- Business name
- Full address
- Phone number
- Public business rating if available (out of 5)
- Total number of reviews
- Approximate distance in miles from the search address
- Today's business hours
- Whether they are currently open

Return at least 5 results. Prioritise businesses that are currently open, have strong ratings, and clearly serve this UK address.`,
  });

  const { object } = await generateObject({
    model: getFixFlowLanguageModel(),
    schema: z.object({ contractors: z.array(ContractorSchema) }),
    prompt: `Extract contractor information from the following text into structured JSON.
If any field is missing, use reasonable defaults:
- rating: 0 if unknown
- total_reviews: 0 if unknown
- distance_miles: 0 if unknown
- hours_today: "Unknown" if not specified
- is_open_now: false if unknown
- maps_url: "" if not available

Text to extract from:
${text}`,
  });

  return object.contractors;
}

async function findContractorsWithBrightData(
  category: Diagnosis["category"],
  address: string,
  radiusMiles: number
) {
  const searchTerm = categoryToSearchTerm(category);
  const city = parseCityFromAddress(address);
  const results = await runBrightDataDiscover({
    query: `${searchTerm} ${city}`,
    intent: `I am helping a UK landlord maintenance assistant identify real local contractors who can service ${address}. Prioritise official contractor websites, Checkatrade, TrustATrader, Yell, Which? Trusted Traders, Google Maps-style local business pages, and other credible local listings. Focus on businesses likely to serve addresses within about ${radiusMiles} miles of ${address}. Exclude generic advice articles, national lead-gen pages with no local branch details, and non-UK results.`,
    city,
    country: "GB",
    language: "en",
    numResults: 10,
    includeContent: true,
  });

  const { object } = await generateObject({
    model: getFixFlowLanguageModel(),
    schema: z.object({ contractors: z.array(ContractorSchema) }),
    prompt: `Using the Bright Data search results below, extract up to 8 real UK contractors that can likely service ${address}.

Rules:
- Return actual contractor businesses, not marketplaces or generic advice sites.
- Prefer businesses with a local phone number, clear service coverage, and stronger ratings.
- If a field is missing, use these defaults:
  - rating: 0
  - total_reviews: 0
  - distance_miles: 0
  - hours_today: "Unknown"
  - is_open_now: false
  - maps_url: the listing URL when no map URL is available

Bright Data results:
${formatBrightDataDiscoverResults(results, {
  maxResults: 10,
  maxContentChars: 1_200,
})}`,
  });

  return object.contractors;
}

async function vetContractorWithProviderTools(params: {
  contractor: Contractor;
  repairType: Diagnosis["category"];
  city: string;
}) {
  const { text } = await generateText({
    model: getFixFlowLanguageModel(),
    tools: getFixFlowSearchTools({
      city: params.city,
      region: "England",
      country: "GB",
      maxUses: 3,
    }),
    system:
      "You must respond with valid JSON matching the VettingSchema exactly. Do not include markdown blocks.",
    prompt: `Search for reviews, complaints, and trade accreditation information for the UK contractor "${params.contractor.name}" in ${params.city}. Also find the typical cost range in GBP for "${params.repairType}" in ${params.city}. Report findings with source URLs. Flag any red flags such as complaints, lawsuits, missing trade credentials, or unresolved safety concerns.

JSON Schema required:
{
  "review_summary": "string",
  "red_flags": ["string"],
  "estimated_cost_low": number,
  "estimated_cost_high": number,
  "sources": ["string url"]
}`,
  });

  return parseVettingPayload(text);
}

async function vetContractorWithBrightData(params: {
  contractor: Contractor;
  repairType: Diagnosis["category"];
  city: string;
}) {
  const results = await runBrightDataDiscover({
    query: `${params.contractor.name} ${params.city} reviews complaints accreditation ${params.repairType} cost`,
    intent: `I am vetting a UK maintenance contractor for landlord dispatch. Prioritise review pages, official company pages, trade-body or credential pages, Companies House references when relevant, complaint discussions from credible sources, and local UK pricing pages for ${params.repairType} work in ${params.city}. Focus on review quality, red flags, accreditation evidence, and a realistic GBP cost range. Exclude thin SEO pages unless they provide concrete pricing or review evidence.`,
    city: params.city,
    country: "GB",
    language: "en",
    numResults: 8,
    includeContent: true,
  });

  const { object } = await generateObject({
    model: getFixFlowLanguageModel(),
    schema: VettingSchema,
    prompt: `Using the Bright Data research below, vet the UK contractor "${params.contractor.name}" in ${params.city}.

Return:
- a 2-3 sentence review summary
- any concrete red flags as short strings
- a likely GBP cost range for ${params.repairType} work in ${params.city}
- source URLs taken from the supplied results only

If you cannot verify a cost range, use 0 for both estimate values.
If you cannot find red flags, return an empty array.

Bright Data results:
${formatBrightDataDiscoverResults(results, {
  maxResults: 8,
  maxContentChars: 1_600,
})}`,
  });

  return object;
}

async function generateQuoteEstimateWithProviderTools(params: {
  contractor: VettedContractor;
  diagnosis: Diagnosis;
  propertyAddress: string;
  city: string;
  costLow: number;
  costHigh: number;
}) {
  const { text } = await generateText({
    model: getFixFlowLanguageModel(),
    tools: getFixFlowSearchTools({
      city: params.city,
      region: "England",
      country: "GB",
      maxUses: 3,
    }),
    system:
      "Produce a grounded AI estimate for a maintenance repair. Respond with valid JSON only and do not pretend a contractor actually confirmed this quote.",
    prompt: `Using current UK market information from web search, generate a grounded AI quote estimate for this likely contractor and repair.

Contractor: ${params.contractor.name}
City: ${params.city}
Property: ${params.propertyAddress}
Repair category: ${params.diagnosis.category}
Issue summary: ${params.diagnosis.description}
Recommended action: ${params.diagnosis.recommended_action}
Safety note: ${params.diagnosis.tenant_safety_note || "None"}
Current vetted cost range: £${params.costLow} - £${params.costHigh}
Contractor review summary: ${params.contractor.review_summary}
Known red flags: ${params.contractor.red_flags.join("; ") || "None"}

Return:
- contractor_quote: one concise paragraph that clearly says this is an AI estimate for ${params.contractor.name}, includes a GBP estimate, and mentions likely attendance timing if inferable
- contractor_quote_confidence: 0 to 1`,
  });

  return parseGroundedJson(text, ContractorQuoteEstimateSchema);
}

async function generateQuoteEstimateWithBrightData(params: {
  contractor: VettedContractor;
  diagnosis: Diagnosis;
  propertyAddress: string;
  city: string;
  costLow: number;
  costHigh: number;
}) {
  const results = await runBrightDataDiscover({
    query: `${params.contractor.name} ${params.city} ${params.diagnosis.category} repair cost`,
    intent: `I am generating a UK landlord-facing AI cost estimate for a likely contractor. Prioritise contractor pages, trusted local directories, review pages, and UK pricing guides that help estimate ${params.diagnosis.category} repair costs in ${params.city}. Focus on realistic GBP ranges, likely call-out or attendance timing, and clues about ${params.contractor.name}'s pricing level. Exclude irrelevant national advice pages without pricing detail.`,
    city: params.city,
    country: "GB",
    language: "en",
    numResults: 8,
    includeContent: true,
  });

  const { object } = await generateObject({
    model: getFixFlowLanguageModel(),
    schema: ContractorQuoteEstimateSchema,
    prompt: `Using the Bright Data research below, generate a grounded AI estimate for this likely repair.

Contractor: ${params.contractor.name}
City: ${params.city}
Property: ${params.propertyAddress}
Repair category: ${params.diagnosis.category}
Issue summary: ${params.diagnosis.description}
Recommended action: ${params.diagnosis.recommended_action}
Safety note: ${params.diagnosis.tenant_safety_note || "None"}
Current vetted cost range: £${params.costLow} - £${params.costHigh}
Contractor review summary: ${params.contractor.review_summary}
Known red flags: ${params.contractor.red_flags.join("; ") || "None"}

Return:
- contractor_quote: one concise paragraph that clearly says it is an AI estimate for ${params.contractor.name}, includes a GBP estimate, and mentions likely attendance timing if inferable
- contractor_quote_confidence: 0 to 1

Bright Data results:
${formatBrightDataDiscoverResults(results, {
  maxResults: 8,
  maxContentChars: 1_400,
})}`,
  });

  return object;
}

export async function findContractorsLive(
  category: Diagnosis["category"],
  address: string,
  radiusMiles: number
) {
  if (getFixFlowWebProvider() === "brightdata") {
    const contractors = await findContractorsWithBrightData(
      category,
      address,
      radiusMiles
    );
    if (contractors.length > 0) {
      return contractors;
    }
  }

  return findContractorsWithProviderTools(category, address, radiusMiles);
}

export async function discoverLiveContractors(
  category: Diagnosis["category"],
  address: string,
  isEmergency: boolean
) {
  let contractors = await findContractorsLive(category, address, 10);
  contractors = deduplicateContractors(contractors);
  contractors = contractors.filter(
    (contractor) => contractor.rating >= 3.5 || contractor.rating === 0
  );

  if (isEmergency && contractors.length < 3) {
    const expanded = await findContractorsLive(category, address, 25);
    contractors = deduplicateContractors([...contractors, ...expanded]).filter(
      (contractor) => contractor.rating >= 3.5 || contractor.rating === 0
    );
  }

  return sortContractors(contractors);
}

export async function vetLiveContractors(params: {
  contractors: Contractor[];
  repairType: Diagnosis["category"];
  city: string;
}): Promise<VettedContractor[]> {
  const top3 = [...params.contractors]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);

  const vettedResults = await Promise.all(
    top3.map(async (contractor) => {
      try {
        const vetted =
          getFixFlowWebProvider() === "brightdata"
            ? await vetContractorWithBrightData({
                contractor,
                repairType: params.repairType,
                city: params.city,
              })
            : await vetContractorWithProviderTools({
                contractor,
                repairType: params.repairType,
                city: params.city,
              });

        return { ...contractor, ...vetted };
      } catch (error) {
        console.error(`[contractor-intelligence] Error vetting ${contractor.name}:`, error);
        return {
          ...contractor,
          review_summary:
            "Automatic review vetting could not be completed for this contractor.",
          red_flags: [
            "Automatic web vetting failed. Review this contractor manually before dispatch.",
          ],
          estimated_cost_low: 0,
          estimated_cost_high: 0,
          sources: [],
        };
      }
    })
  );

  return vettedResults.sort((a, b) => {
    const aFlags = a.red_flags?.length || 0;
    const bFlags = b.red_flags?.length || 0;
    if (aFlags === 0 && bFlags > 0) return -1;
    if (bFlags === 0 && aFlags > 0) return 1;
    return b.rating - a.rating;
  });
}

export async function generateAiQuoteEstimate(params: {
  contractor: VettedContractor;
  diagnosis: Diagnosis;
  propertyAddress: string;
  city: string;
  costLow: number;
  costHigh: number;
}) {
  if (getFixFlowWebProvider() === "brightdata") {
    return generateQuoteEstimateWithBrightData(params);
  }

  return generateQuoteEstimateWithProviderTools(params);
}
