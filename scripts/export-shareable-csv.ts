import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { normalizeImportRows } from "../src/lib/import/normalize-records";
import { parseWorkbook } from "../src/lib/import/parser";

const DEFAULT_INPUT = "Contacts for database.xlsx";
const DEFAULT_OUTPUT = "exports/clients_investors_shareable_2026-05-05.csv";

type CsvValue = string | number | boolean | null | undefined;

const columns = [
  "company_name",
  "company_domain",
  "company_country",
  "company_categories",
  "company_description",
  "contact_name",
  "job_title",
  "primary_email",
  "email_addresses",
  "phone_numbers",
  "linkedin_url",
  "contact_country",
  "contact_categories",
  "connection_strength",
  "data_quality",
] as const;

function csvEscape(value: CsvValue) {
  if (value === null || value === undefined) return "";
  const text = String(value)
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: CsvValue[]) {
  return values.map(csvEscape).join(",");
}

function joinList(values: string[]) {
  return [...new Set(values.filter(Boolean))].join("; ");
}

async function main() {
  const inputPath = resolve(process.argv[2] ?? DEFAULT_INPUT);
  const outputPath = resolve(process.argv[3] ?? DEFAULT_OUTPUT);

  const parsed = await parseWorkbook(await readFile(inputPath));
  const normalized = normalizeImportRows(parsed.rows);

  const companiesBySourceKey = new Map(normalized.companies.map((company) => [company.sourceKey, company]));
  const peopleBySourceRecordId = new Map(normalized.people.map((person) => [person.sourceRecordId, person]));
  const emailsByPerson = new Map<string, string[]>();

  for (const item of normalized.personEmails) {
    const emails = emailsByPerson.get(item.sourceRecordId) ?? [];
    emails.push(item.email);
    emailsByPerson.set(item.sourceRecordId, emails);
  }

  const rows = normalized.companyPeople
    .flatMap((link) => {
      const company = companiesBySourceKey.get(link.companySourceKey);
      const person = peopleBySourceRecordId.get(link.sourceRecordId);
      if (!company || !person) return [];

      const emails = emailsByPerson.get(person.sourceRecordId) ?? [];
      return {
        company,
        person,
        emails: [...new Set(emails)],
        roleTitle: link.roleTitle,
        relationshipStrength: link.relationshipStrength,
      };
    })
    .sort((a, b) => {
      const companyCompare = a.company.name.localeCompare(b.company.name);
      if (companyCompare !== 0) return companyCompare;
      return a.person.displayName.localeCompare(b.person.displayName);
    });

  const csv = [
    csvRow([...columns]),
    ...rows.map(({ company, person, emails, roleTitle, relationshipStrength }) =>
      csvRow([
        company.name,
        company.websiteDomain,
        company.country,
        joinList(company.categories),
        company.description,
        person.displayName,
        roleTitle ?? person.jobTitle,
        emails[0] ?? null,
        joinList(emails),
        person.phoneNumbers,
        person.linkedinUrl,
        person.country,
        joinList(person.categories),
        relationshipStrength ?? person.connectionStrength,
        company.sourceQuality,
      ]),
    ),
  ].join("\n");

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${csv}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        input: inputPath,
        output: outputPath,
        rawRows: parsed.rows.length,
        exportedRows: rows.length,
        normalizedCompanies: normalized.companies.length,
        normalizedPeople: normalized.people.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
