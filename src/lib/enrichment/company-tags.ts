import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { CompanyEnrichment, Tag } from "@/lib/types";

export const DEFAULT_COMPANY_TAG_COLOR = "#2563eb";
const MAX_COMPANY_TAG_LENGTH = 80;

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

export function companyEnrichmentTagNames(enrichment: Pick<CompanyEnrichment, "status" | "industry" | "subsector">) {
  if (enrichment.status !== "completed") return [];
  return uniqueCompanyTagNames([enrichment.industry, enrichment.subsector]);
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
  enrichment: Pick<CompanyEnrichment, "status" | "industry" | "subsector">;
}) {
  const tagNames = companyEnrichmentTagNames(enrichment);
  const tags = await ensureCompanyTags({ supabase, organizationId, companyId, tagNames });
  return { tagNames, tags };
}
