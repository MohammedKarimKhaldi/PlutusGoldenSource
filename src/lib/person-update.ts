import { domainFromEmail, isPersonalEmailDomain, normalizeWhitespace } from "./import/normalization";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PersonEmailUpdateRow = {
  organization_id: string;
  person_id: string;
  email: string;
  domain: string;
  is_primary: boolean;
  is_personal_domain: boolean;
  created_at: string;
};

export function normalizePersonEmails(values: string[]) {
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const value of values) {
    const email = value.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  return emails;
}

export function isValidPersonEmail(email: string) {
  return EMAIL_PATTERN.test(email);
}

export function normalizePersonCategories(values: string[]) {
  const seen = new Set<string>();
  const categories: string[] = [];

  for (const value of values) {
    for (const part of value.split(/[;,]/)) {
      const category = normalizeWhitespace(part);
      const key = category.toLowerCase();
      if (!category || seen.has(key)) continue;
      seen.add(key);
      categories.push(category);
    }
  }

  return categories;
}

export function buildPersonEmailUpdateRows({
  organizationId,
  personId,
  emails,
  now = new Date(),
}: {
  organizationId: string;
  personId: string;
  emails: string[];
  now?: Date;
}): PersonEmailUpdateRow[] {
  return emails.map((email, index) => {
    const domain = domainFromEmail(email) ?? "";

    return {
      organization_id: organizationId,
      person_id: personId,
      email,
      domain,
      is_primary: index === 0,
      is_personal_domain: isPersonalEmailDomain(domain),
      created_at: new Date(now.getTime() + index).toISOString(),
    };
  });
}
