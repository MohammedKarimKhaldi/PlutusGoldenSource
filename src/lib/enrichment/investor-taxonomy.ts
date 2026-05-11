export const INVESTOR_CLASSIFICATION_TAGS = [
  "Private Equity",
  "Venture Capital",
  "Fund of Funds",
  "Family Office",
  "Asset Manager",
  "Institutional Investor",
  "Corporate Venture Capital",
  "Sovereign Wealth Fund",
  "Pension Fund",
  "Endowment/Foundation",
  "Fund Manager",
  "Investment Fund",
  "LP Investor",
  "GP/Manager",
  "Buyout",
  "Growth Equity",
  "Lower Middle Market",
  "Middle Market",
  "Large Cap",
  "Private Credit",
  "Special Situations",
  "Distressed Investing",
  "Secondaries",
  "Co-Investment",
  "Infrastructure Investor",
  "Real Estate Investor",
  "Pre-Seed",
  "Seed",
  "Early Stage VC",
  "Series A/B",
  "Late Stage VC",
  "Growth Venture",
  "Deep Tech VC",
  "Life Sciences VC",
  "Fintech VC",
  "Climate VC",
  "B2B SaaS VC",
  "Consumer VC",
  "Private Equity Fund of Funds",
  "Venture Fund of Funds",
  "Multi-Manager",
  "LP Allocator",
  "Fund Selector",
  "UK Focus",
  "Europe Focus",
  "US Focus",
  "North America Focus",
  "MENA Focus",
  "Asia Focus",
  "Global Focus",
] as const;

const INVESTOR_TAG_ALIASES: Record<string, (typeof INVESTOR_CLASSIFICATION_TAGS)[number]> = {
  fof: "Fund of Funds",
  "funds of funds": "Fund of Funds",
  "asset management": "Asset Manager",
  vc: "Venture Capital",
  "venture capital fund of funds": "Venture Fund of Funds",
  "private equity fund-of-funds": "Private Equity Fund of Funds",
  "venture fund-of-funds": "Venture Fund of Funds",
  "co investment": "Co-Investment",
  coinvestment: "Co-Investment",
  "b2b saas vc": "B2B SaaS VC",
  "series a b": "Series A/B",
  "gp manager": "GP/Manager",
  "endowment foundation": "Endowment/Foundation",
};

function taxonomyKey(value: string) {
  return value
    .replace(/[–—]/g, "-")
    .replace(/[/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const INVESTOR_TAGS_BY_KEY = new Map<string, (typeof INVESTOR_CLASSIFICATION_TAGS)[number]>(
  INVESTOR_CLASSIFICATION_TAGS.map((tag) => [taxonomyKey(tag), tag]),
);

for (const [alias, tag] of Object.entries(INVESTOR_TAG_ALIASES)) {
  INVESTOR_TAGS_BY_KEY.set(taxonomyKey(alias), tag);
}

export function canonicalInvestorClassificationTag(value: string | null | undefined) {
  const key = taxonomyKey(value ?? "");
  if (!key) return null;
  return INVESTOR_TAGS_BY_KEY.get(key) ?? null;
}

export function investorClassificationTagNames(values: Array<string | null | undefined>, limit = 8) {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of values) {
    const tag = canonicalInvestorClassificationTag(value);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= limit) break;
  }

  return tags;
}
