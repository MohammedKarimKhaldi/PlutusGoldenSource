import type { CapacityStatus, Company, InvestmentRelationship, InvestmentStatus, Person } from "@/lib/types";

export const CONTACT_EXPORT_CRITERIA = [
  "sector_category",
  "company_tag",
  "stage",
  "country",
  "source_quality",
  "email_domain",
  "enrichment_status",
  "investment_status",
  "capacity_status",
  "deal_name",
] as const;

export type ContactExportCriterion = (typeof CONTACT_EXPORT_CRITERIA)[number];

export type ContactExportRow = {
  company: Company;
  person: Person;
};

type CsvValue = string | number | boolean | null | undefined;

export const CONTACT_EXPORT_LABELS: Record<ContactExportCriterion, string> = {
  sector_category: "Sector/category",
  company_tag: "Company tag",
  stage: "Stage",
  country: "Country",
  source_quality: "Source quality",
  email_domain: "Email domain",
  enrichment_status: "Enrichment status",
  investment_status: "Investment status",
  capacity_status: "Capacity status",
  deal_name: "Deal name",
};

export function isContactExportCriterion(value: string): value is ContactExportCriterion {
  return CONTACT_EXPORT_CRITERIA.includes(value as ContactExportCriterion);
}

function normalizeFilterValue(value: string) {
  return value.trim().toLowerCase();
}

function includesValue(values: Array<string | null | undefined>, value: string) {
  const query = normalizeFilterValue(value);
  if (!query) return true;
  return values.some((item) => item?.toLowerCase().includes(query));
}

function exactValue(values: Array<string | null | undefined>, value: string) {
  const query = normalizeFilterValue(value);
  if (!query) return true;
  return values.some((item) => item?.toLowerCase() === query);
}

export function investmentSummary(relationships: InvestmentRelationship[]) {
  const investmentStatuses = [...new Set(relationships.map((item) => item.investmentStatus))];
  const capacityStatuses = [...new Set(relationships.map((item) => item.capacityStatus))];
  const deals = relationships.flatMap((item) => item.deals);
  const pastDeals = deals.filter((deal) => deal.status === "closed").map((deal) => deal.name);
  const currentDeals = deals.filter((deal) => deal.status === "active").map((deal) => deal.name);
  const lastInvestedDate =
    relationships
      .map((item) => item.lastInvestedDate)
      .filter((item): item is string => Boolean(item))
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return {
    investmentStatuses,
    capacityStatuses,
    pastDeals: [...new Set(pastDeals)],
    currentDeals: [...new Set(currentDeals)],
    dealNames: [...new Set(deals.map((deal) => deal.name))],
    lastInvestedDate,
  };
}

function companyAndPersonRelationships(company: Company, person: Person) {
  const relationshipIds = new Set<string>();
  const relationships: InvestmentRelationship[] = [];

  for (const relationship of [...company.investmentRelationships, ...person.investmentRelationships]) {
    if (relationshipIds.has(relationship.id)) continue;
    relationshipIds.add(relationship.id);
    relationships.push(relationship);
  }

  return relationships;
}

export function companyMatchesContactExportCriterion(company: Company, criterion: ContactExportCriterion, value: string) {
  const relationships = company.investmentRelationships;
  const summary = investmentSummary(relationships);

  switch (criterion) {
    case "sector_category":
      return includesValue(
        [
          ...company.categories,
          ...company.tags.map((tag) => tag.name),
          ...company.people.flatMap((person) => person.categories),
          company.enrichment?.industry,
          company.enrichment?.subsector,
          company.enrichment?.companyType,
          ...(company.enrichment?.keywords ?? []),
        ],
        value,
      );
    case "company_tag":
      return exactValue(company.tags.map((tag) => tag.name), value);
    case "stage":
      return exactValue([company.outreachStage], value);
    case "country":
      return exactValue([company.country], value);
    case "source_quality":
      return exactValue([company.sourceQuality], value);
    case "email_domain":
      return company.people.some((person) => person.emails.some((email) => exactValue([email.split("@").pop()], value)));
    case "enrichment_status":
      return exactValue([company.enrichment?.status ?? "pending"], value);
    case "investment_status":
      return exactValue(summary.investmentStatuses, value);
    case "capacity_status":
      return exactValue(summary.capacityStatuses, value);
    case "deal_name":
      return includesValue(summary.dealNames, value);
  }
}

export function personMatchesContactExportCriterion(company: Company, person: Person, criterion: ContactExportCriterion, value: string) {
  if (!value.trim()) return true;
  const relationships = companyAndPersonRelationships(company, person);
  const summary = investmentSummary(relationships);

  switch (criterion) {
    case "email_domain":
      return person.emails.some((email) => exactValue([email.split("@").pop()], value));
    case "investment_status":
      return exactValue(summary.investmentStatuses, value);
    case "capacity_status":
      return exactValue(summary.capacityStatuses, value);
    case "deal_name":
      return includesValue(summary.dealNames, value);
    default:
      return companyMatchesContactExportCriterion(company, criterion, value);
  }
}

export function filterContactExportRows(companies: Company[], criterion: ContactExportCriterion, value: string): ContactExportRow[] {
  return companies.flatMap((company) =>
    company.people
      .filter((person) => personMatchesContactExportCriterion(company, person, criterion, value))
      .map((person) => ({ company, person })),
  );
}

export function contactExportValues(companies: Company[], criterion: ContactExportCriterion) {
  const values = new Set<string>();

  companies.forEach((company) => {
    if (criterion === "sector_category") {
      company.categories.forEach((item) => values.add(item));
      company.tags.forEach((item) => values.add(item.name));
      company.people.forEach((person) => person.categories.forEach((item) => values.add(item)));
      if (company.enrichment?.industry) values.add(company.enrichment.industry);
      if (company.enrichment?.subsector) values.add(company.enrichment.subsector);
      company.enrichment?.keywords.forEach((item) => values.add(item));
    }
    if (criterion === "company_tag") company.tags.forEach((item) => values.add(item.name));
    if (criterion === "stage") values.add(company.outreachStage);
    if (criterion === "country" && company.country) values.add(company.country);
    if (criterion === "source_quality") values.add(company.sourceQuality);
    if (criterion === "email_domain") {
      company.people.forEach((person) => person.emails.forEach((email) => values.add(email.split("@").pop() ?? "")));
    }
    if (criterion === "enrichment_status") values.add(company.enrichment?.status ?? "pending");
    const allRelationships = [...company.investmentRelationships, ...company.people.flatMap((person) => person.investmentRelationships)];
    if (criterion === "investment_status") allRelationships.forEach((item) => values.add(item.investmentStatus));
    if (criterion === "capacity_status") allRelationships.forEach((item) => values.add(item.capacityStatus));
    if (criterion === "deal_name") allRelationships.forEach((item) => item.deals.forEach((deal) => values.add(deal.name)));
  });

  return [...values].filter(Boolean).sort((left, right) => left.localeCompare(right, "en-US"));
}

function csvEscape(value: CsvValue) {
  if (value === null || value === undefined) return "";
  const text = String(value)
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function joinList(values: string[]) {
  return [...new Set(values.filter(Boolean))].join("; ");
}

export const CONTACT_EXPORT_COLUMNS = [
  "company_name",
  "company_domain",
  "company_country",
  "company_categories",
  "company_tags",
  "outreach_stage",
  "source_quality",
  "enrichment_status",
  "enrichment_industry",
  "enrichment_subsector",
  "enrichment_summary",
  "contact_name",
  "job_title",
  "primary_email",
  "email_addresses",
  "linkedin_url",
  "phone",
  "contact_country",
  "contact_categories",
  "connection_strength",
  "highlighted",
  "investment_status",
  "capacity_status",
  "past_deals",
  "current_deals",
  "last_invested_date",
] as const;

export function buildContactsCsv(rows: ContactExportRow[]) {
  const csvRows = rows.map(({ company, person }) => {
    const summary = investmentSummary(companyAndPersonRelationships(company, person));
    return [
      company.name,
      company.websiteDomains.join("; "),
      company.country,
      joinList(company.categories),
      joinList(company.tags.map((tag) => tag.name)),
      company.outreachStage,
      company.sourceQuality,
      company.enrichment?.status ?? "pending",
      company.enrichment?.industry,
      company.enrichment?.subsector,
      company.enrichment?.summary,
      person.displayName,
      person.jobTitle,
      person.emails[0] ?? person.email,
      joinList(person.emails),
      person.linkedinUrl,
      person.phone,
      person.country,
      joinList(person.categories),
      person.connectionStrength,
      person.highlighted ? "Yes" : "No",
      joinList(summary.investmentStatuses.map(formatInvestmentStatus)),
      joinList(summary.capacityStatuses.map(formatCapacityStatus)),
      joinList(summary.pastDeals),
      joinList(summary.currentDeals),
      summary.lastInvestedDate,
    ];
  });

  return [[...CONTACT_EXPORT_COLUMNS], ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function formatInvestmentStatus(value: InvestmentStatus) {
  return value.replaceAll("_", " ");
}

export function formatCapacityStatus(value: CapacityStatus) {
  return value === "fully_allocated" ? "fully allocated" : value;
}
