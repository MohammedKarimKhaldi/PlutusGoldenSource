import type { RawContactRow } from "./parser";
import {
  cleanDisplayName,
  domainFromEmail,
  isPersonalEmailDomain,
  normalizeCompanyName,
  normalizePersonName,
  parseEmailList,
  sourceQualityFromConfidence,
  splitCategories,
} from "./normalization";

export type NormalizedCompany = {
  sourceKey: string;
  name: string;
  normalizedName: string;
  websiteDomain: string | null;
  description: string | null;
  country: string | null;
  categories: string[];
  sourceQuality: "high" | "medium" | "low" | "review";
  confidence: number;
  sourceRecordIds: string[];
};

export type NormalizedPerson = {
  sourceRecordId: string;
  displayName: string;
  normalizedName: string;
  linkedinUrl: string | null;
  jobTitle: string | null;
  phoneNumbers: string | null;
  country: string | null;
  categories: string[];
  connectionStrength: string | null;
};

export type NormalizedPersonEmail = {
  sourceRecordId: string;
  email: string;
  domain: string;
  isPrimary: boolean;
  isPersonalDomain: boolean;
};

export type NormalizedCompanyPerson = {
  sourceRecordId: string;
  companySourceKey: string;
  roleTitle: string | null;
  relationshipStrength: string | null;
};

export type MergeAuditCandidate = {
  entityType: "company" | "person";
  candidateKey: string;
  sourceRecordId: string;
  confidence: number;
  rule: string;
  action: "auto_merge" | "review" | "new_record";
  evidence: Record<string, unknown>;
};

export type NormalizedImport = {
  companies: NormalizedCompany[];
  people: NormalizedPerson[];
  personEmails: NormalizedPersonEmail[];
  companyPeople: NormalizedCompanyPerson[];
  mergeAudit: MergeAuditCandidate[];
  summary: {
    rawRows: number;
    normalizedCompanies: number;
    normalizedPeople: number;
    suspiciousMerges: number;
    unmatchedRows: number;
  };
};

type CompanyAccumulator = NormalizedCompany & {
  categorySet: Set<string>;
};

type PersonAccumulator = NormalizedPerson & {
  categorySet: Set<string>;
};

function normalizeUrlKey(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function normalizeLooseText(value: string | null | undefined) {
  if (!value) return "";
  return value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function isBetterDisplayName(current: string, candidate: string) {
  if (!current || current === "Unnamed contact") return true;
  if (current.includes("@") && !candidate.includes("@")) return true;
  return candidate.length > current.length && !candidate.includes("@");
}

function personKeyForRow(row: RawContactRow, normalizedCompanyName: string, primaryEmail: string | null) {
  const normalizedName = normalizePersonName(row.record);
  const normalizedLinkedin = normalizeUrlKey(row.linkedinUrl);

  if (normalizedLinkedin) {
    return {
      sourceKey: `linkedin:${normalizedLinkedin}`,
      confidence: 0.98,
      rule: "linkedin_profile",
      action: "auto_merge" as const,
    };
  }

  if (normalizedName && normalizedCompanyName && normalizedCompanyName !== "unmatched") {
    return {
      sourceKey: `name-company:${normalizedName}:${normalizedCompanyName}`,
      confidence: 0.84,
      rule: "normalized_person_name_and_company",
      action: "auto_merge" as const,
    };
  }

  if (primaryEmail) {
    return {
      sourceKey: `email:${primaryEmail}`,
      confidence: 0.78,
      rule: "primary_email_address",
      action: "auto_merge" as const,
    };
  }

  return {
    sourceKey: `person-row:${row.sourceRecordId}`,
    confidence: 0.42,
    rule: "insufficient_person_signal",
    action: "review" as const,
  };
}

function companyKeyForRow(row: RawContactRow, primaryEmailDomain: string | null, isPersonalDomain: boolean) {
  const normalizedName = normalizeCompanyName(row.companyName ?? row.duplicateCompanyName);
  const rawName = row.companyName ?? row.duplicateCompanyName;
  const hasUsableName = Boolean(normalizedName && normalizedName !== "unnamed company");

  if (hasUsableName && primaryEmailDomain && !isPersonalDomain) {
    return {
      sourceKey: `name-domain:${normalizedName}:${primaryEmailDomain}`,
      confidence: 0.96,
      rule: "company_name_and_corporate_email_domain",
      action: "auto_merge" as const,
      normalizedName,
      name: rawName ?? primaryEmailDomain,
    };
  }

  if (hasUsableName) {
    return {
      sourceKey: `name:${normalizedName}`,
      confidence: 0.82,
      rule: "normalized_company_name",
      action: "auto_merge" as const,
      normalizedName,
      name: rawName ?? normalizedName,
    };
  }

  if (primaryEmailDomain && !isPersonalDomain) {
    return {
      sourceKey: `domain:${primaryEmailDomain}`,
      confidence: 0.74,
      rule: "corporate_email_domain_without_company_name",
      action: "review" as const,
      normalizedName: primaryEmailDomain,
      name: primaryEmailDomain,
    };
  }

  return {
    sourceKey: `unmatched:${row.sourceRecordId}`,
    confidence: 0.35,
    rule: "insufficient_company_signal",
    action: "review" as const,
    normalizedName: normalizedName || "unmatched",
    name: rawName ?? "Unnamed company",
  };
}

export function normalizeImportRows(rows: RawContactRow[]): NormalizedImport {
  const companies = new Map<string, CompanyAccumulator>();
  const people = new Map<string, PersonAccumulator>();
  const personEmails: NormalizedPersonEmail[] = [];
  const companyPeople = new Map<string, NormalizedCompanyPerson>();
  const preferredCompanyKeyByName = new Map<string, string>();
  const mergeAudit: MergeAuditCandidate[] = [];
  let unmatchedRows = 0;

  for (const row of rows) {
    const emails = parseEmailList(row.emailAddresses);
    const primaryEmail = emails[0] ?? null;
    const primaryDomain = domainFromEmail(primaryEmail);
    const primaryDomainIsPersonal = isPersonalEmailDomain(primaryDomain);
    let companyKey = companyKeyForRow(row, primaryDomain, primaryDomainIsPersonal);
    const preferredCompanyKey = companyKey.normalizedName ? preferredCompanyKeyByName.get(companyKey.normalizedName) : null;

    if (companyKey.rule === "normalized_company_name" && preferredCompanyKey) {
      companyKey = {
        ...companyKey,
        sourceKey: preferredCompanyKey,
        confidence: 0.91,
        rule: "normalized_company_name_matched_existing_corporate_domain",
        action: "auto_merge",
      };
    }
    const personKey = personKeyForRow(row, companyKey.normalizedName, primaryEmail);
    const displayName = cleanDisplayName(row.record, primaryEmail);
    const personCategories = splitCategories(row.personCategories);
    const existingPerson = people.get(personKey.sourceKey);

    if (existingPerson) {
      personCategories.forEach((category) => existingPerson.categorySet.add(category));
      if (isBetterDisplayName(existingPerson.displayName, displayName)) {
        existingPerson.displayName = displayName;
      }
      if (!existingPerson.linkedinUrl && row.linkedinUrl) existingPerson.linkedinUrl = row.linkedinUrl;
      if (!existingPerson.jobTitle && row.jobTitle) existingPerson.jobTitle = row.jobTitle;
      if (!existingPerson.phoneNumbers && row.phoneNumbers) existingPerson.phoneNumbers = row.phoneNumbers;
      if (!existingPerson.country && row.country) existingPerson.country = row.country;
      if (!existingPerson.connectionStrength && row.connectionStrength) existingPerson.connectionStrength = row.connectionStrength;
    } else {
      people.set(personKey.sourceKey, {
        sourceRecordId: personKey.sourceKey,
        displayName,
        normalizedName: normalizePersonName(row.record),
        linkedinUrl: row.linkedinUrl,
        jobTitle: row.jobTitle,
        phoneNumbers: row.phoneNumbers,
        country: row.country,
        categories: personCategories,
        categorySet: new Set(personCategories),
        connectionStrength: row.connectionStrength,
      });
    }

    emails.forEach((email, index) => {
      const domain = domainFromEmail(email);
      if (!domain) return;

      personEmails.push({
        sourceRecordId: personKey.sourceKey,
        email,
        domain,
        isPrimary: index === 0,
        isPersonalDomain: isPersonalEmailDomain(domain),
      });
    });

    if (companyKey.sourceKey.startsWith("unmatched:")) {
      unmatchedRows += 1;
    }

    const existing = companies.get(companyKey.sourceKey);
    const companyCategories = splitCategories(row.companyCategories);
    if (existing) {
      companyCategories.forEach((category) => existing.categorySet.add(category));
      existing.sourceRecordIds.push(row.sourceRecordId);
      if (!existing.country && row.country) existing.country = row.country;
      if (!existing.description && row.companyDescription) existing.description = row.companyDescription;
      existing.confidence = Math.max(existing.confidence, companyKey.confidence);
      existing.sourceQuality = sourceQualityFromConfidence(existing.confidence);
    } else {
      companies.set(companyKey.sourceKey, {
        sourceKey: companyKey.sourceKey,
        name: companyKey.name,
        normalizedName: companyKey.normalizedName,
        websiteDomain: primaryDomain && !primaryDomainIsPersonal ? primaryDomain : null,
        description: row.companyDescription,
        country: row.country,
        categories: companyCategories,
        categorySet: new Set(companyCategories),
        sourceQuality: sourceQualityFromConfidence(companyKey.confidence),
        confidence: companyKey.confidence,
        sourceRecordIds: [row.sourceRecordId],
      });
    }

    if (companyKey.rule === "company_name_and_corporate_email_domain" && companyKey.normalizedName) {
      preferredCompanyKeyByName.set(companyKey.normalizedName, companyKey.sourceKey);
    }

    companyPeople.set(`${companyKey.sourceKey}:${personKey.sourceKey}`, {
      sourceRecordId: personKey.sourceKey,
      companySourceKey: companyKey.sourceKey,
      roleTitle: row.jobTitle,
      relationshipStrength: row.connectionStrength,
    });

    mergeAudit.push({
      entityType: "company",
      candidateKey: companyKey.sourceKey,
      sourceRecordId: row.sourceRecordId,
      confidence: companyKey.confidence,
      rule: companyKey.rule,
      action: companyKey.action,
      evidence: {
        rowNumber: row.rowNumber,
        companyName: row.companyName,
        duplicateCompanyName: row.duplicateCompanyName,
        primaryDomain,
        primaryDomainIsPersonal,
      },
    });

    mergeAudit.push({
      entityType: "person",
      candidateKey: personKey.sourceKey,
      sourceRecordId: row.sourceRecordId,
      confidence: personKey.confidence,
      rule: personKey.rule,
      action: personKey.action,
      evidence: {
        rowNumber: row.rowNumber,
        normalizedName: normalizePersonName(row.record),
        normalizedJobTitle: normalizeLooseText(row.jobTitle),
        companySourceKey: companyKey.sourceKey,
        linkedinUrl: normalizeUrlKey(row.linkedinUrl),
        primaryEmail,
      },
    });
  }

  const normalizedCompanies = [...companies.values()].map(({ categorySet, ...company }) => ({
    ...company,
    categories: [...categorySet],
  }));
  const normalizedPeople = [...people.values()].map(({ categorySet, ...person }) => ({
    ...person,
    categories: [...categorySet],
  }));
  const suspiciousMerges = mergeAudit.filter((item) => item.action === "review" || item.confidence < 0.72).length;

  return {
    companies: normalizedCompanies,
    people: normalizedPeople,
    personEmails,
    companyPeople: [...companyPeople.values()],
    mergeAudit,
    summary: {
      rawRows: rows.length,
      normalizedCompanies: normalizedCompanies.length,
      normalizedPeople: normalizedPeople.length,
      suspiciousMerges,
      unmatchedRows,
    },
  };
}
