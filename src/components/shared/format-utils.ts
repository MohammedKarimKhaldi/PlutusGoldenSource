export const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
export const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(value: string | null) {
  if (!value) return "No activity";
  return DATE_FORMATTER.format(new Date(value));
}

export function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

export function formatMinorMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amountMinor / 100);
}

export function amountInputFromMinor(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

export function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function formatChangeCount(count: number) {
  return `${formatNumber(count)} pending change${count === 1 ? "" : "s"}`;
}

export function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function searchTokens(query: string) {
  return normalizeSearchValue(query).split(" ").filter(Boolean);
}

export function searchTextMatches(text: string, query: string) {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  return tokens.every((token) => text.includes(token));
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function formatCompanyWebsites(company: { websiteDomains: string[]; country: string | null }) {
  if (company.websiteDomains.length === 0) return company.country ?? "No domain";
  if (company.websiteDomains.length === 1) return company.websiteDomains[0];
  return `${company.websiteDomains[0]} +${company.websiteDomains.length - 1}`;
}
