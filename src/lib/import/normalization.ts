export const PERSONAL_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.fr",
  "icloud.com",
  "live.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "tmomail.net",
  "yahoo.com",
  "yahoo.fr",
]);

const COMPANY_SUFFIXES = /\b(?:ag|bv|corp|corporation|gmbh|group|holding|holdings|inc|incorporated|llc|llp|limited|ltd|plc|sa|sas|sarl|spa|the)\b/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeCompanyName(value: string | null | undefined): string {
  if (!value) return "";

  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(COMPANY_SUFFIXES, " "),
  );
}

export function normalizePersonName(value: string | null | undefined): string {
  if (!value) return "";
  return normalizeWhitespace(value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " "));
}

export function parseEmailList(value: string | null | undefined): string[] {
  if (!value) return [];
  const matches = value.match(EMAIL_PATTERN) ?? [];
  return [...new Set(matches.map((email) => email.toLowerCase()))];
}

export function domainFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  return email.split("@").pop()?.toLowerCase() ?? null;
}

export function isPersonalEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return PERSONAL_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export function splitCategories(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(/[;,]/).map((item) => normalizeWhitespace(item)).filter(Boolean))];
}

export function cleanDisplayName(value: string | null | undefined, fallbackEmail: string | null): string {
  const trimmed = normalizeWhitespace(value ?? "");
  if (!trimmed && fallbackEmail) return fallbackEmail.split("@")[0];
  if (trimmed.includes("@") && fallbackEmail) return fallbackEmail.split("@")[0];
  return trimmed || "Unnamed contact";
}

export function sourceQualityFromConfidence(confidence: number): "high" | "medium" | "low" | "review" {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.72) return "medium";
  if (confidence >= 0.55) return "low";
  return "review";
}
