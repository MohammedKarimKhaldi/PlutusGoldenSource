import { NextResponse } from "next/server";
import { z } from "zod";

import { clearDashboardDataCache } from "@/lib/data";
import { enrichCompany } from "@/lib/enrichment/company-enrichment";
import { localEnrichmentEnabled } from "@/lib/enrichment-config";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  companyId: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

type CompanyRow = {
  id: string;
  name: string;
  website_domain: string | null;
  description: string | null;
  country: string | null;
  categories: string[] | null;
};

function websiteDomains(value: string | null) {
  return (value ?? "")
    .split(/[;\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  if (!localEnrichmentEnabled()) {
    return NextResponse.json({ error: "Local enrichment is disabled. Configure OLLAMA_BASE_URL on this server to enable it online." }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid enrichment request." }, { status: 400 });

  const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
  if (!organizationId) return NextResponse.json({ error: "Missing NEXT_PUBLIC_DEFAULT_ORG_ID." }, { status: 400 });

  const serverSupabase = await createSupabaseServerClient();
  if (!serverSupabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const {
    data: { user },
  } = await serverSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in before running enrichment." }, { status: 401 });

  const adminSupabase = createSupabaseAdminClient();
  if (!adminSupabase) return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 503 });

  if (!parsed.data.force) {
    const { data: existing, error: existingError } = await adminSupabase
      .from("company_enrichments")
      .select("status")
      .eq("organization_id", organizationId)
      .eq("company_id", parsed.data.companyId)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (existing?.status === "completed") return NextResponse.json({ skipped: true, status: "completed" });
  }

  const { data: company, error: companyError } = await adminSupabase
    .from("companies")
    .select("id,name,website_domain,description,country,categories")
    .eq("organization_id", organizationId)
    .eq("id", parsed.data.companyId)
    .maybeSingle();

  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  const companyRow = company as CompanyRow;
  const enrichment = await enrichCompany({
    companyId: companyRow.id,
    name: companyRow.name,
    websiteDomains: websiteDomains(companyRow.website_domain),
    description: companyRow.description,
    country: companyRow.country,
    categories: companyRow.categories ?? [],
  });

  const { error: upsertError } = await adminSupabase.from("company_enrichments").upsert(
    {
      organization_id: organizationId,
      company_id: enrichment.companyId,
      status: enrichment.status,
      summary: enrichment.summary,
      industry: enrichment.industry,
      subsector: enrichment.subsector,
      company_type: enrichment.companyType,
      location: enrichment.location,
      keywords: enrichment.keywords,
      source_url: enrichment.sourceUrl,
      model: enrichment.model,
      confidence: enrichment.confidence,
      error_message: enrichment.errorMessage,
      generated_at: enrichment.generatedAt,
      reviewed_at: enrichment.reviewedAt,
      updated_at: enrichment.updatedAt,
    },
    { onConflict: "organization_id,company_id" },
  );

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  await clearDashboardDataCache();

  return NextResponse.json({ enrichment });
}
