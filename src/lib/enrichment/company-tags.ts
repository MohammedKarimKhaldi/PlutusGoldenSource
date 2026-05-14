import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { CompanyEnrichment, Tag } from "@/lib/types";
import { canonicalInvestorClassificationTag, investorClassificationTagNames } from "./investor-taxonomy";

export const DEFAULT_COMPANY_TAG_COLOR = "#2563eb";
const MAX_COMPANY_TAG_LENGTH = 80;
const MAX_ENRICHMENT_TAGS = 8;
const ALWAYS_SKIP_TAGS = new Set([
  "business",
  "company",
  "organization",
  "investor",
  "investors",
  "private",
  "private company",
  "privately held",
  "privately held company",
  "public company",
  "listed company",
  "operating company",
  "commercial company",
]);
const BROAD_INVESTOR_TAGS = new Set(["finance", "financial services", "investment", "investments", "investment management"]);
const TOP_LEVEL_INVESTOR_TAGS = new Set(["Private Equity", "Venture Capital", "Fund of Funds"]);
const GENERIC_INVESTOR_TAGS = new Set(["Asset Manager", "Fund Manager", "Investment Fund", "Institutional Investor"]);
const GEOGRAPHY_FOCUS_TAGS = new Set(["UK Focus", "Europe Focus", "US Focus", "North America Focus", "MENA Focus", "Asia Focus", "Global Focus"]);
const GENERIC_KEYWORD_TAGS = new Set([
  "app",
  "application",
  "customer",
  "customers",
  "digital",
  "general",
  "global",
  "mobile",
  "online",
  "platform",
  "private company",
  "products",
  "services",
  "solution",
  "solutions",
  "technology",
  "website",
]);

type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type SupabaseQueryError = { message: string };
type CompanyTagInsert = {
  organization_id: string;
  company_id: string;
  tag_id: string;
};

function normalizeCompanyTagName(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function validCompanyTagName(value: string) {
  return value.length > 0 && value.length <= MAX_COMPANY_TAG_LENGTH;
}

function errorMessage(label: string, error: SupabaseQueryError) {
  return `${label}: ${error.message}`;
}

function throwIfError(label: string, error: SupabaseQueryError | null) {
  if (error) throw new Error(errorMessage(label, error));
}

function uniqueCompanyTagNames(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const value of values) {
    const name = normalizeCompanyTagName(value);
    const key = name.toLowerCase();
    if (!validCompanyTagName(name) || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

function baseEnrichmentTagNames(values: Array<string | null | undefined>, hasInvestorTags: boolean) {
  return values.filter((value) => {
    const name = normalizeCompanyTagName(value);
    const key = name.toLowerCase();
    if (!name || ALWAYS_SKIP_TAGS.has(key)) return false;
    if (hasInvestorTags && BROAD_INVESTOR_TAGS.has(key)) return false;
    return !canonicalInvestorClassificationTag(name);
  });
}

function titleCaseTagName(value: string) {
  return value
    .split(/\s+/)
    .map((word) => {
      if (/^[A-Z0-9&-]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function fallbackKeywordTagNames(values: Array<string | null | undefined>) {
  return values
    .map(normalizeCompanyTagName)
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || ALWAYS_SKIP_TAGS.has(key) || GENERIC_KEYWORD_TAGS.has(key)) return false;
      if (BROAD_INVESTOR_TAGS.has(key) || canonicalInvestorClassificationTag(name)) return false;
      if (/[.!?]/.test(name)) return false;
      return name.split(/\s+/).length <= 4;
    })
    .map(titleCaseTagName);
}

type EnrichmentForTags = Pick<CompanyEnrichment, "industry" | "subsector"> & Partial<Pick<CompanyEnrichment, "companyType" | "keywords" | "summary">>;

function confidentInvestorTagNames(enrichment: EnrichmentForTags) {
  const rawInvestorTags = investorClassificationTagNames([enrichment.industry, enrichment.subsector, enrichment.companyType, ...(enrichment.keywords ?? [])], MAX_ENRICHMENT_TAGS);
  const evidenceTags = investorClassificationTagNames([enrichment.industry, enrichment.subsector, ...(enrichment.keywords ?? [])], MAX_ENRICHMENT_TAGS);
  const nonGeographyEvidenceTags = evidenceTags.filter((tag) => !GEOGRAPHY_FOCUS_TAGS.has(tag));
  const specificEvidenceTags = nonGeographyEvidenceTags.filter((tag) => !GENERIC_INVESTOR_TAGS.has(tag) && !TOP_LEVEL_INVESTOR_TAGS.has(tag));
  const hasConfidentInvestorEvidence = specificEvidenceTags.length > 0 || nonGeographyEvidenceTags.length >= 2;

  if (!hasConfidentInvestorEvidence) return [];
  return rawInvestorTags.filter((tag) => !GEOGRAPHY_FOCUS_TAGS.has(tag) || nonGeographyEvidenceTags.length > 0);
}

function hasInvestorClaim(enrichment: EnrichmentForTags) {
  return investorClassificationTagNames([enrichment.industry, enrichment.subsector, enrichment.companyType, ...(enrichment.keywords ?? [])], 1).length > 0;
}

export function companyEnrichmentTagNames(
  enrichment: Pick<CompanyEnrichment, "status" | "industry" | "subsector"> & Partial<Pick<CompanyEnrichment, "companyType" | "keywords" | "summary">>,
) {
  if (enrichment.status !== "completed") return [];
  const investorTags = confidentInvestorTagNames(enrichment);
  const baseTags = baseEnrichmentTagNames([enrichment.industry, enrichment.subsector, enrichment.companyType], investorTags.length > 0 || hasInvestorClaim(enrichment));
  const keywordTags = investorTags.length === 0 && baseTags.length === 0 ? fallbackKeywordTagNames(enrichment.keywords ?? []) : [];
  return uniqueCompanyTagNames([...investorTags, ...baseTags, ...keywordTags]).slice(0, MAX_ENRICHMENT_TAGS);
}

export async function ensureCompanyTags({
  supabase,
  organizationId,
  companyId,
  tagNames,
}: {
  supabase: SupabaseAdminClient;
  organizationId: string;
  companyId: string;
  tagNames: string[];
}) {
  const names = uniqueCompanyTagNames(tagNames);
  if (names.length === 0) return [];

  const { data: existingRows, error: existingError } = await supabase.from("tags").select("id,name,color").eq("organization_id", organizationId);
  throwIfError("Fetch existing company tags", existingError);

  const existingByName = new Map<string, Tag>();
  (existingRows ?? []).forEach((row) => {
    const tag = row as Tag;
    existingByName.set(tag.name.trim().toLowerCase(), tag);
  });

  const missingNames: string[] = [];
  const targetNames = names.map((name) => {
    const existing = existingByName.get(name.toLowerCase());
    if (existing) return existing.name;
    missingNames.push(name);
    return name;
  });

  if (missingNames.length > 0) {
    const { error } = await supabase.from("tags").upsert(
      missingNames.map((name) => ({
        organization_id: organizationId,
        name,
        color: DEFAULT_COMPANY_TAG_COLOR,
      })),
      { onConflict: "organization_id,name", ignoreDuplicates: true },
    );
    throwIfError("Create enrichment company tags", error);
  }

  const { data: tagRows, error: tagError } = await supabase.from("tags").select("id,name,color").eq("organization_id", organizationId).in("name", targetNames);
  throwIfError("Fetch enrichment company tags", tagError);

  const tagsByName = new Map<string, Tag>();
  (tagRows ?? []).forEach((row) => {
    const tag = row as Tag;
    tagsByName.set(tag.name.trim().toLowerCase(), tag);
  });

  const tags = names
    .map((name) => tagsByName.get(name.toLowerCase()) ?? existingByName.get(name.toLowerCase()))
    .filter((tag): tag is Tag => Boolean(tag));

  if (tags.length === 0) return [];

  const companyTagRows: CompanyTagInsert[] = tags.map((tag) => ({
    organization_id: organizationId,
    company_id: companyId,
    tag_id: tag.id,
  }));

  const { error: companyTagError } = await supabase.from("company_tags").upsert(companyTagRows, { onConflict: "organization_id,company_id,tag_id" });
  throwIfError("Apply enrichment company tags", companyTagError);

  return tags;
}

export async function applyCompanyEnrichmentTags({
  supabase,
  organizationId,
  companyId,
  enrichment,
}: {
  supabase: SupabaseAdminClient;
  organizationId: string;
  companyId: string;
  enrichment: Pick<CompanyEnrichment, "status" | "industry" | "subsector"> & Partial<Pick<CompanyEnrichment, "companyType" | "keywords" | "summary">>;
}) {
  const tagNames = companyEnrichmentTagNames(enrichment);
  const tags = await ensureCompanyTags({ supabase, organizationId, companyId, tagNames });
  return { tagNames, tags };
}
