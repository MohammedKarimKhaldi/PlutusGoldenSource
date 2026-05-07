const WEBSITE_SPLIT_PATTERN = /[\n,;]+/;

function normalizeCompanyWebsite(value: string) {
  let domain = value.trim().toLowerCase();
  if (!domain) return "";

  domain = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  domain = domain.replace(/^www\./, "");
  domain = domain.split(/[/?#]/)[0] ?? "";
  domain = domain.replace(/:\d+$/, "").replace(/\.+$/, "");

  return domain;
}

export function normalizeCompanyWebsites(values: string[] | string | null | undefined) {
  const rawValues = Array.isArray(values) ? values : String(values ?? "").split(WEBSITE_SPLIT_PATTERN);
  const seen = new Set<string>();
  const websites: string[] = [];

  for (const value of rawValues) {
    for (const part of value.split(WEBSITE_SPLIT_PATTERN)) {
      const domain = normalizeCompanyWebsite(part);
      if (!domain || seen.has(domain)) continue;
      seen.add(domain);
      websites.push(domain);
    }
  }

  return websites;
}

export function serializeCompanyWebsites(values: string[] | string | null | undefined) {
  const websites = normalizeCompanyWebsites(values);
  return websites.length > 0 ? websites.join("; ") : null;
}
