import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { normalizeImportRows } from "../src/lib/import/normalize-records";
import { parseWorkbook, summarizeParsedWorkbook } from "../src/lib/import/parser";

nextEnv.loadEnvConfig(process.cwd());

const CHUNK_SIZE = 500;
const LOOKUP_CHUNK_SIZE = 50;

function chunks<T>(items: T[], size: number): T[][] {
  const grouped: T[][] = [];
  for (let index = 0; index < items.length; index += size) grouped.push(items.slice(index, index + size));
  return grouped;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env.local and fill Supabase credentials.`);
  return value;
}

async function main() {
  const filePath = resolve(process.argv[2] ?? "Contacts for database.xlsx");
  const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID ?? process.env.ORG_ID;
  if (!organizationId) throw new Error("Missing NEXT_PUBLIC_DEFAULT_ORG_ID or ORG_ID.");

  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Reading ${filePath}`);
  const parsed = await parseWorkbook(await readFile(filePath));
  const normalized = normalizeImportRows(parsed.rows);
  const parseSummary = summarizeParsedWorkbook(parsed);

  console.log(
    `Parsed ${parsed.rows.length} raw rows into ${normalized.companies.length} companies and ${normalized.people.length} people.`,
  );

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      organization_id: organizationId,
      file_name: basename(filePath),
      sheet_name: parsed.sheetName,
      row_count: parsed.rows.length,
      status: "running",
      stats: { ...parseSummary, ...normalized.summary },
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

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
    if (error) throw error;
  }
  console.log("Raw staging rows inserted.");

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
    if (error) throw error;
  }
  console.log("Companies upserted.");

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
    if (error) throw error;
  }
  console.log("People upserted.");

  const companyIdBySourceKey = new Map<string, string>();
  for (const group of chunks(normalized.companies.map((company) => company.sourceKey), LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("companies")
      .select("id,source_key")
      .eq("organization_id", organizationId)
      .in("source_key", group);
    if (error) throw error;
    data?.forEach((row) => companyIdBySourceKey.set(row.source_key, row.id));
  }

  const personIdBySourceRecordId = new Map<string, string>();
  for (const group of chunks(normalized.people.map((person) => person.sourceRecordId), LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("people")
      .select("id,source_record_id")
      .eq("organization_id", organizationId)
      .in("source_record_id", group);
    if (error) throw error;
    data?.forEach((row) => personIdBySourceRecordId.set(row.source_record_id, row.id));
  }

  for (const group of chunks(normalized.personEmails, CHUNK_SIZE)) {
    const rows = group.flatMap((email) => {
      const personId = personIdBySourceRecordId.get(email.sourceRecordId);
      if (!personId) return [];
      return {
        organization_id: organizationId,
        person_id: personId,
        email: email.email,
        domain: email.domain,
        is_primary: email.isPrimary,
        is_personal_domain: email.isPersonalDomain,
      };
    });
    if (rows.length === 0) continue;
    const { error } = await supabase.from("person_emails").upsert(rows, { onConflict: "organization_id,email" });
    if (error) throw error;
  }
  console.log("Emails linked.");

  for (const group of chunks(normalized.companyPeople, CHUNK_SIZE)) {
    const rows = group.flatMap((link) => {
      const companyId = companyIdBySourceKey.get(link.companySourceKey);
      const personId = personIdBySourceRecordId.get(link.sourceRecordId);
      if (!companyId || !personId) return [];
      return {
        organization_id: organizationId,
        company_id: companyId,
        person_id: personId,
        role_title: link.roleTitle,
        relationship_strength: link.relationshipStrength,
      };
    });
    if (rows.length === 0) continue;
    const { error } = await supabase.from("company_people").upsert(rows, { onConflict: "organization_id,company_id,person_id" });
    if (error) throw error;
  }
  console.log("Company/person links upserted.");

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
    if (error) throw error;
  }
  console.log("Default outreach opportunities ensured.");

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
    if (error) throw error;
  }
  console.log("Merge audit inserted.");

  const { error: completeError } = await supabase
    .from("import_batches")
    .update({ status: "completed", completed_at: new Date().toISOString(), stats: { ...parseSummary, ...normalized.summary } })
    .eq("id", batch.id);
  if (completeError) throw completeError;

  console.log("Import completed.");
  console.log(JSON.stringify({ importBatchId: batch.id, ...normalized.summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
