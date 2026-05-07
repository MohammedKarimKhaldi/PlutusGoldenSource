import { NextResponse } from "next/server";

import { clearDashboardDataCache } from "@/lib/data";
import { normalizeImportRows } from "@/lib/import/normalize-records";
import { parseWorkbook, summarizeParsedWorkbook } from "@/lib/import/parser";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const CHUNK_SIZE = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const grouped: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    grouped.push(items.slice(index, index + size));
  }
  return grouped;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const organizationId = String(form.get("organizationId") ?? process.env.NEXT_PUBLIC_DEFAULT_ORG_ID ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload an XLSX file with the form field named file." }, { status: 400 });
  }

  if (!organizationId) {
    return NextResponse.json({ error: "Missing organizationId." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 503 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseWorkbook(buffer);
  const normalized = normalizeImportRows(parsed.rows);
  const parseSummary = summarizeParsedWorkbook(parsed);

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      organization_id: organizationId,
      file_name: file.name,
      sheet_name: parsed.sheetName,
      row_count: parsed.rows.length,
      status: "running",
      stats: { ...parseSummary, ...normalized.summary },
    })
    .select("id")
    .single();

  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });

  for (const group of chunks(parsed.rows, CHUNK_SIZE)) {
    const { error } = await supabase.from("raw_import_rows").insert(
      group.map((row) => ({
        organization_id: organizationId,
        import_batch_id: batch.id,
        source_row_number: row.rowNumber,
        source_record_id: row.sourceRecordId,
        data: row.raw,
        mapped: row,
      })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const group of chunks(normalized.companies, CHUNK_SIZE)) {
    const { error } = await supabase.from("companies").upsert(
      group.map((company) => ({
        organization_id: organizationId,
        source_key: company.sourceKey,
        name: company.name,
        normalized_name: company.normalizedName,
        website_domain: company.websiteDomain,
        description: company.description,
        country: company.country,
        categories: company.categories,
        source_quality: company.sourceQuality,
        merge_confidence: company.confidence,
      })),
      { onConflict: "organization_id,source_key" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const group of chunks(normalized.people, CHUNK_SIZE)) {
    const { error } = await supabase.from("people").upsert(
      group.map((person) => ({
        organization_id: organizationId,
        source_record_id: person.sourceRecordId,
        display_name: person.displayName,
        normalized_name: person.normalizedName,
        linkedin_url: person.linkedinUrl,
        job_title: person.jobTitle,
        phone_numbers: person.phoneNumbers,
        country: person.country,
        categories: person.categories,
        connection_strength: person.connectionStrength,
      })),
      { onConflict: "organization_id,source_record_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const companyIdBySourceKey = new Map<string, string>();
  for (const group of chunks(normalized.companies.map((company) => company.sourceKey), CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("companies")
      .select("id,source_key")
      .eq("organization_id", organizationId)
      .in("source_key", group);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data?.forEach((row) => companyIdBySourceKey.set(row.source_key, row.id));
  }

  const personIdBySourceRecordId = new Map<string, string>();
  for (const group of chunks(normalized.people.map((person) => person.sourceRecordId), CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("people")
      .select("id,source_record_id")
      .eq("organization_id", organizationId)
      .in("source_record_id", group);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data?.forEach((row) => personIdBySourceRecordId.set(row.source_record_id, row.id));
  }

  for (const group of chunks(normalized.personEmails, CHUNK_SIZE)) {
    const { error } = await supabase.from("person_emails").upsert(
      group
        .map((email) => {
          const personId = personIdBySourceRecordId.get(email.sourceRecordId);
          if (!personId) return null;
          return {
            organization_id: organizationId,
            person_id: personId,
            email: email.email,
            domain: email.domain,
            is_primary: email.isPrimary,
            is_personal_domain: email.isPersonalDomain,
          };
        })
        .filter(Boolean),
      { onConflict: "organization_id,email" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const group of chunks(normalized.companyPeople, CHUNK_SIZE)) {
    const { error } = await supabase.from("company_people").upsert(
      group
        .map((link) => {
          const companyId = companyIdBySourceKey.get(link.companySourceKey);
          const personId = personIdBySourceRecordId.get(link.sourceRecordId);
          if (!companyId || !personId) return null;
          return {
            organization_id: organizationId,
            company_id: companyId,
            person_id: personId,
            role_title: link.roleTitle,
            relationship_strength: link.relationshipStrength,
          };
        })
        .filter(Boolean),
      { onConflict: "organization_id,company_id,person_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const group of chunks([...companyIdBySourceKey.values()], CHUNK_SIZE)) {
    const { error } = await supabase.from("outreach_opportunities").upsert(
      group.map((companyId) => ({
        organization_id: organizationId,
        company_id: companyId,
        stage: "Research",
        status: "active",
      })),
      { onConflict: "organization_id,company_id", ignoreDuplicates: true },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const group of chunks(normalized.mergeAudit, CHUNK_SIZE)) {
    const { error } = await supabase.from("merge_audit").insert(
      group.map((audit) => ({
        organization_id: organizationId,
        import_batch_id: batch.id,
        entity_type: audit.entityType,
        candidate_key: audit.candidateKey,
        source_record_id: audit.sourceRecordId,
        confidence: audit.confidence,
        rule: audit.rule,
        action: audit.action,
        evidence: audit.evidence,
      })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: completeError } = await supabase
    .from("import_batches")
    .update({ status: "completed", completed_at: new Date().toISOString(), stats: { ...parseSummary, ...normalized.summary } })
    .eq("id", batch.id);

  if (completeError) return NextResponse.json({ error: completeError.message }, { status: 500 });

  await clearDashboardDataCache();

  return NextResponse.json({
    importBatchId: batch.id,
    sheetName: parsed.sheetName,
    duplicateHeaderMap: parsed.duplicateHeaderMap,
    ...normalized.summary,
  });
}
