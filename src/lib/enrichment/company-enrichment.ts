import { DOMParser } from "@xmldom/xmldom";
import { z } from "zod";

import { ollamaBaseUrl, ollamaModel } from "../enrichment-config";
import type { CompanyEnrichment } from "../types";
import { INVESTOR_CLASSIFICATION_TAGS, canonicalInvestorClassificationTag, investorClassificationTagNames } from "./investor-taxonomy";

type EnrichmentInput = {
  companyId: string;
  name: string;
  websiteDomains: string[];
  description: string | null;
  country: string | null;
  categories: string[];
};

type FetchLike = typeof fetch;
type XmlNodeLike = {
  nodeType: number;
  nodeValue: string | null;
  childNodes: {
    length: number;
    item(index: number): XmlNodeLike | null;
  };
};
type XmlElementLike = XmlNodeLike & {
  tagName?: string;
  textContent?: string | null;
  getAttribute(name: string): string | null;
};
type XmlDocumentLike = {
  documentElement: XmlElementLike;
  getElementsByTagName(name: string): {
    length: number;
    item(index: number): XmlElementLike | null;
  };
};

const MAX_WEBSITE_TEXT = 12000;
const MAX_SUMMARY_LENGTH = 1200;
const MAX_LOCATION_LENGTH = 160;
const REQUEST_TIMEOUT_MS = 12000;
const QUIET_XMLDOM_ON_ERROR = () => {};
const NOISY_HTML_BLOCK_PATTERN = /<(script|style|noscript)\b[\s\S]*?<\/\1>/gi;
const BROAD_FINANCIAL_LABELS = new Set(["finance", "financial services", "investment", "investments", "investment management"]);
const ORGANIZATION_LOCATION_WORD_PATTERN =
  /\b(company|co\.?|limited|ltd|inc|llc|llp|plc|gmbh|sarl|sas|group|holdings?|partners?|capital|ventures?|technolog(?:y|ies)|systems?|software|bank|insurance|trust|foundation|university|hospitals?|clinic|medical centre|medical center|institute|school|college)\b/i;
const INVESTOR_ACTIVITY_PATTERN =
  /\b(private equity|venture capital|funds? of funds?|asset management|investment management|investment firm|investment strategy|fund manager|asset manager|institutional investor|lp investor|limited partner|general partner|\bLP\b|\bGP\b|allocat(?:e|es|ed|ing|or|ion)|co-?invest(?:ment|s|ing)?|secondar(?:y|ies)|buyout|growth equity|private credit|distressed investing|special situations|portfolio compan(?:y|ies)|portfolio investments?|assets under management|\bAUM\b|manag(?:e|es|ed|ing) (?:funds?|capital|assets)|rais(?:e|es|ed|ing) (?:a )?(?:fund|capital)|back(?:s|ed|ing) (?:companies|founders|startups)|invest(?:s|ed|ing) in|capital partner|family office|sovereign wealth|pension fund|endowment|seed fund|early stage|late stage|series [ab]|corporate venture)\b/i;
const BUSINESS_TAG_RULES: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "Food Delivery", pattern: /\b(food delivery|deliver(?:s|y|ed|ing)? food|restaurant delivery|takeaway|takeout)\b/i },
  { tag: "Grocery Delivery", pattern: /\b(grocer(?:y|ies) delivery|supermarket delivery|deliver(?:s|y|ed|ing)? grocer(?:y|ies))\b/i },
  { tag: "Delivery", pattern: /\b(deliver(?:s|y|ed|ing)|courier|last[-\s]?mile)\b/i },
  { tag: "Marketplace", pattern: /\b(marketplace|platform connecting|connects? customers|two[-\s]?sided platform)\b/i },
  { tag: "E-commerce", pattern: /\b(e[-\s]?commerce|online shopping|online marketplace|order online)\b/i },
  { tag: "Restaurants", pattern: /\b(restaurants?|foodservice|food service)\b/i },
  { tag: "Retail", pattern: /\b(retail|shops?|stores?)\b/i },
  { tag: "Software", pattern: /\b(software|app|application|platform|workflow|automation|digital product)\b/i },
  { tag: "SaaS", pattern: /\b(saas|software as a service|subscription software)\b/i },
  { tag: "Artificial Intelligence", pattern: /\b(artificial intelligence|machine learning|\bAI\b|llm|generative ai)\b/i },
  { tag: "Cybersecurity", pattern: /\b(cybersecurity|cyber security|security platform|threat detection)\b/i },
  { tag: "Payments", pattern: /\b(payments?|payment processing|checkout|merchant acquiring)\b/i },
  { tag: "Fintech", pattern: /\b(fintech|financial technology|digital banking|neobank)\b/i },
  { tag: "Banking", pattern: /\b(bank|banking|lending|loans?|credit)\b/i },
  { tag: "Insurance", pattern: /\b(insurance|insurtech|underwriting|claims?)\b/i },
  { tag: "Healthcare", pattern: /\b(healthcare|health care|medical|clinical|patient care)\b/i },
  { tag: "Hospitals", pattern: /\b(hospitals?|clinic|nhs trust)\b/i },
  { tag: "Biotech", pattern: /\b(biotech|biotechnology|therapeutics|drug discovery)\b/i },
  { tag: "Medical Devices", pattern: /\b(medical devices?|diagnostics?|medtech)\b/i },
  { tag: "Education", pattern: /\b(education|edtech|learning platform|school|university)\b/i },
  { tag: "Logistics", pattern: /\b(logistics|supply chain|fulfilment|fulfillment|warehousing)\b/i },
  { tag: "Manufacturing", pattern: /\b(manufactur(?:e|es|ing)|industrial|factory|production)\b/i },
  { tag: "Real Estate", pattern: /\b(real estate|property|proptech)\b/i },
  { tag: "Construction", pattern: /\b(construction|building materials|contractor)\b/i },
  { tag: "Energy", pattern: /\b(energy|renewables?|solar|wind power|battery storage)\b/i },
  { tag: "Climate Tech", pattern: /\b(climate tech|decarboni[sz]ation|carbon|emissions?)\b/i },
  { tag: "Telecommunications", pattern: /\b(telecom|telecommunications|connectivity|broadband|mobile network)\b/i },
  { tag: "Media", pattern: /\b(media|publishing|streaming|content platform)\b/i },
  { tag: "Marketing", pattern: /\b(marketing|advertising|adtech|brand platform)\b/i },
  { tag: "Consulting", pattern: /\b(consulting|advisory|professional services)\b/i },
  { tag: "Travel", pattern: /\b(travel|tourism|booking platform)\b/i },
  { tag: "Hospitality", pattern: /\b(hospitality|hotels?|restaurants?|venues?)\b/i },
  { tag: "Agriculture", pattern: /\b(agriculture|agtech|farming|farmers?)\b/i },
  { tag: "Food and Beverage", pattern: /\b(food and beverage|f&b|beverages?|food products?)\b/i },
  { tag: "Consumer Goods", pattern: /\b(consumer goods|consumer products?|fmcg)\b/i },
];

const enrichmentResponseSchema = z.object({
  summary: z.preprocess(summaryFromUnknown, z.string().trim().max(MAX_SUMMARY_LENGTH).nullable().optional()),
  industry: z.string().trim().max(160).nullable().optional(),
  subsector: z.string().trim().max(160).nullable().optional(),
  companyType: z.string().trim().max(160).nullable().optional(),
  location: z.preprocess(locationFromUnknown, z.string().trim().max(MAX_LOCATION_LENGTH).nullable().optional()),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).nullable().optional(),
  classificationTags: z.array(z.string().trim().min(1).max(80)).max(8).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type GeneratedCompanyEnrichment = z.infer<typeof enrichmentResponseSchema>;

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function summaryFromUnknown(value: unknown) {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return trimToLength(value, MAX_SUMMARY_LENGTH);
  if (Array.isArray(value)) return trimToLength(value.map((entry) => (typeof entry === "string" ? entry : "")).filter(Boolean).join(" "), MAX_SUMMARY_LENGTH);
  return null;
}

function comparableText(value: string) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function trimToLength(value: string, maxLength: number) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  return cleanText(truncated.replace(/[,;:\s]+[^\s,;:]*$/, ""));
}

function compactLocationText(value: string) {
  const text = cleanText(value);
  if (text.length <= MAX_LOCATION_LENGTH) return text;

  const anchoredLocation = /\b(?:headquartered|headquarters|based|located)\s+in\s+([^.;|]+?)(?=\s+(?:and|with|while|serving|operat(?:es|ing)|across)\b|[.;|]|$)/i.exec(text)?.[1];
  if (anchoredLocation) return trimToLength(anchoredLocation, MAX_LOCATION_LENGTH);

  const firstSentence = text.split(/[.;|]/).map(cleanText).find(Boolean);
  if (firstSentence && firstSentence.length <= MAX_LOCATION_LENGTH) return firstSentence;

  const commaParts = uniqueLocationParts(text.split(","));
  if (commaParts.length > 1) {
    const parts: string[] = [];
    for (const part of commaParts) {
      const next = [...parts, part].join(", ");
      if (next.length > MAX_LOCATION_LENGTH) break;
      parts.push(part);
    }
    if (parts.length > 0) return parts.join(", ");
  }

  return trimToLength(firstSentence ?? text, MAX_LOCATION_LENGTH);
}

function uniqueLocationParts(values: string[]) {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const value of values) {
    const part = cleanText(value);
    const key = part.toLowerCase();
    if (!part || seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }

  return parts;
}

function collectLocationParts(value: unknown, depth = 0): string[] {
  if (value == null || depth > 2) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => collectLocationParts(entry, depth + 1));
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const geographyKeys = [
    "city",
    "town",
    "area",
    "place",
    "places",
    "district",
    "neighborhood",
    "neighbourhood",
    "locality",
    "campus",
    "campuses",
    "county",
    "region",
    "state",
    "country",
    "countryName",
    "site",
    "sites",
    "address",
    "location",
    "locations",
  ];
  const geographyParts = geographyKeys.flatMap((key) => collectLocationParts(record[key], depth + 1));
  if (geographyParts.length > 0) return geographyParts;
  const fallbackParts = ["name", "label"].flatMap((key) => collectLocationParts(record[key], depth + 1));
  if (fallbackParts.length > 0) return fallbackParts;
  return Object.values(record).flatMap((entry) => collectLocationParts(entry, depth + 1));
}

function locationFromUnknown(value: unknown) {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return compactLocationText(value);
  const parts = uniqueLocationParts(collectLocationParts(value));
  return parts.length > 0 ? compactLocationText(parts.join(", ")) : null;
}

function sharedWordCount(left: string, right: string) {
  const leftWords = left.split(" ").filter((word) => word.length > 2);
  const rightWords = new Set(right.split(" ").filter((word) => word.length > 2));
  return leftWords.filter((word) => rightWords.has(word)).length;
}

function locationIfSupported(value: string | null | undefined, input: EnrichmentInput) {
  const location = cleanText(value ?? "");
  if (!location) return null;

  const comparableLocation = comparableText(location);
  const comparableName = comparableText(input.name);
  if (comparableLocation && comparableLocation === comparableName) return null;

  if (
    comparableLocation.includes(comparableName) ||
    (ORGANIZATION_LOCATION_WORD_PATTERN.test(location) && (comparableName.includes(comparableLocation) || sharedWordCount(comparableLocation, comparableName) >= 3))
  ) {
    return null;
  }

  return location;
}

function normalizeWebsiteDomain(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/+/, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

function websiteFetchUrls(domains: string[]) {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const rawDomain of domains) {
    const domain = normalizeWebsiteDomain(rawDomain);
    if (!domain) continue;
    const domainVariants = domain.startsWith("www.") ? [domain, domain.slice(4)] : [domain, `www.${domain}`];

    for (const protocol of ["https", "http"]) {
      for (const domainVariant of domainVariants) {
        const url = `${protocol}://${domainVariant}`;
        if (seen.has(url)) continue;
        seen.add(url);
        urls.push(url);
      }
    }
  }

  return urls;
}

function fetchFailureMessage(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}

function hasInvestorActivityEvidence(input: EnrichmentInput, websiteText: string) {
  return INVESTOR_ACTIVITY_PATTERN.test([input.name, input.description, input.country, input.categories.join(" "), websiteText].filter(Boolean).join(" "));
}

function isInvestorOrFinancialLabel(value: string | null | undefined) {
  const label = cleanText(value ?? "");
  if (!label) return false;
  return Boolean(canonicalInvestorClassificationTag(label)) || BROAD_FINANCIAL_LABELS.has(label.toLowerCase());
}

function healthcareTrustClassification(input: EnrichmentInput) {
  const text = [input.name, input.description, input.categories.join(" ")].filter(Boolean).join(" ");
  const isNhsTrust = /\bNHS\s+(?:Foundation\s+)?Trust\b/i.test(text);
  const isHospitalTrust = /\b(?:University\s+)?Hospitals?\b/i.test(text) && /\bTrust\b/i.test(text);
  if (!isNhsTrust && !isHospitalTrust) return null;

  return {
    industry: "Healthcare",
    subsector: /\bUniversity\s+Hospitals?\b/i.test(text) ? "University Hospitals" : "Hospitals",
    companyType: isNhsTrust ? "NHS Trust" : "Hospital Trust",
  };
}

function labelIfSupported(value: string | null | undefined, hasInvestorEvidence: boolean) {
  const label = cleanText(value ?? "");
  if (!label) return null;
  return !hasInvestorEvidence && isInvestorOrFinancialLabel(label) ? null : label;
}

function keywordsIfSupported(values: Array<string | null | undefined>, hasInvestorEvidence: boolean) {
  return values.filter((value) => hasInvestorEvidence || !isInvestorOrFinancialLabel(value));
}

function businessTagsFromText(input: EnrichmentInput, websiteText: string) {
  const text = [input.name, input.description, input.country, input.categories.join(" "), websiteText].filter(Boolean).join(" ");
  const tags = BUSINESS_TAG_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.tag);
  if (healthcareTrustClassification(input)) return tags.filter((tag) => tag !== "Education");
  return tags;
}

function stripNoisyHtmlBlocks(html: string) {
  return html.replace(NOISY_HTML_BLOCK_PATTERN, " ");
}

function decodeHtmlText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&[a-z][a-z0-9]+;?/gi, " ");
}

function extractFirstTagText(html: string, tagName: string) {
  const match = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(html);
  return match ? decodeHtmlText(match[1].replace(/<[^>]+>/g, " ")) : "";
}

function htmlAttribute(tag: string, name: string) {
  const quoted = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag);
  if (quoted) return quoted[1];
  return new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i").exec(tag)?.[1] ?? "";
}

function fallbackWebsiteText(html: string) {
  const htmlWithoutNoisyBlocks = stripNoisyHtmlBlocks(html).replace(/<!--[\s\S]*?-->/g, " ");
  const title = cleanText(extractFirstTagText(htmlWithoutNoisyBlocks, "title"));
  const description = cleanText(
    (htmlWithoutNoisyBlocks.match(/<meta\b[^>]*>/gi) ?? [])
      .map((tag) => {
        const metaName = htmlAttribute(tag, "name").toLowerCase();
        const propertyName = htmlAttribute(tag, "property").toLowerCase();
        if (metaName !== "description" && propertyName !== "og:description") return "";
        return decodeHtmlText(htmlAttribute(tag, "content"));
      })
      .find(Boolean) ?? "",
  );
  const bodyHtml = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(htmlWithoutNoisyBlocks)?.[1] ?? htmlWithoutNoisyBlocks;
  const body = cleanText(decodeHtmlText(bodyHtml.replace(/<[^>]+>/g, " ")));
  return cleanText([title, description, body].filter(Boolean).join("\n")).slice(0, MAX_WEBSITE_TEXT);
}

function textContent(node: XmlNodeLike | null | undefined): string {
  if (!node) return "";
  if (node.nodeType === 3) return node.nodeValue ?? "";

  const element = node as XmlElementLike;
  const tagName = element.tagName?.toLowerCase();
  if (tagName === "script" || tagName === "style" || tagName === "noscript") return "";

  let text = "";
  for (let index = 0; index < node.childNodes.length; index += 1) {
    text += ` ${textContent(node.childNodes.item(index))}`;
  }
  return text;
}

function elementsByTagName(document: XmlDocumentLike, name: string) {
  const collection = document.getElementsByTagName(name);
  return Array.from({ length: collection.length }, (_, index) => collection.item(index)).filter((item): item is XmlElementLike => Boolean(item));
}

function metaContent(document: XmlDocumentLike, name: string) {
  const metas = elementsByTagName(document, "meta");
  const target = name.toLowerCase();
  const meta = metas.find((item) => {
    const metaName = item.getAttribute("name")?.toLowerCase();
    const propertyName = item.getAttribute("property")?.toLowerCase();
    return metaName === target || propertyName === target;
  });
  return meta?.getAttribute("content") ?? "";
}

export function extractWebsiteText(html: string) {
  try {
    const document = new DOMParser({ onError: QUIET_XMLDOM_ON_ERROR, locator: false }).parseFromString(stripNoisyHtmlBlocks(html), "text/html") as unknown as XmlDocumentLike;
    const title = cleanText(document.getElementsByTagName("title").item(0)?.textContent ?? "");
    const description = cleanText(metaContent(document, "description") || metaContent(document, "og:description"));
    const body = cleanText(textContent(document.getElementsByTagName("body").item(0) ?? document.documentElement));
    const text = cleanText([title, description, body].filter(Boolean).join("\n")).slice(0, MAX_WEBSITE_TEXT);
    if (text) return text;
  } catch {
    // Real company websites often ship malformed builder HTML; use a resilient text fallback.
  }

  return fallbackWebsiteText(html);
}

async function fetchWithTimeout(fetcher: FetchLike, url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetcher(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "GoldenSourceCRM/1.0 (+local enrichment)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCompanyWebsiteText(domains: string[], fetcher: FetchLike = fetch) {
  const urls = websiteFetchUrls(domains);
  if (urls.length === 0) throw new Error("Company has no website domain to enrich.");

  const failures: string[] = [];

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(fetcher, url);
      if (!response.ok) {
        failures.push(`${url} returned ${response.status}`);
        continue;
      }

      const html = await response.text();
      const text = extractWebsiteText(html);
      if (!text) {
        failures.push(`${url} did not contain usable text`);
        continue;
      }

      return { sourceUrl: url, text };
    } catch (error) {
      failures.push(`${url}: ${fetchFailureMessage(error)}`);
    }
  }

  throw new Error(`Could not fetch company website. Tried ${urls.length} URL${urls.length === 1 ? "" : "s"}. Last error: ${failures.at(-1) ?? "unknown error"}`);
}

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first >= 0 && last > first) return value.slice(first, last + 1);
  return value;
}

export function parseCompanyEnrichmentJson(value: string): GeneratedCompanyEnrichment {
  const parsed = JSON.parse(extractJson(value));
  return enrichmentResponseSchema.parse(parsed);
}

function uniqueKeywords(values: Array<string | null | undefined>, limit = 30) {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const value of values) {
    const keyword = cleanText(value ?? "");
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
    if (keywords.length >= limit) break;
  }

  return keywords;
}

function buildPrompt(input: EnrichmentInput, websiteText: string) {
  return [
    "You enrich a private CRM record for investment outreach.",
    "Return strict JSON only, with these keys: summary, industry, subsector, companyType, location, keywords, classificationTags, confidence.",
    "Use null when unsure. Keep summary under 80 words. Confidence is 0 to 1.",
    "summary must be an original concise company description, not copied verbatim from page metadata. Do not omit it when the website text gives enough information.",
    "location must be a concise string, not an object. Company names often contain places; location must contain only the actual place names, never the full organization name.",
    "For example, for a name like 'Royal Liverpool and Broadgreen University Hospital NHS Trust', use 'Liverpool and Broadgreen, United Kingdom' as location when supported, not the full trust name.",
    "For funds, funds of funds, private equity, venture capital, and allocators, be precise and prefer specific investor labels over broad labels.",
    "For private operating companies, always return specific industry, subsector, and keyword labels for what the company actually does; do not use Private Company as the only useful label.",
    "classificationTags must contain only labels from the controlled taxonomy below, at most 8 labels, and only when supported by the company name, known fields, or website text.",
    "Do not classify a company as Financial Services, Asset Manager, Fund Manager, Investment Fund, Private Equity, Venture Capital, or Fund of Funds unless it explicitly manages capital, manages funds, allocates to funds, invests from a balance sheet, or operates as an LP/GP.",
    "If the company is software, consulting, research, healthcare, media, technology, advisory, or another operating business, leave classificationTags empty unless the text clearly says it is an investor.",
    "If a firm invests in funds as an LP, prefer Fund of Funds, Venture Fund of Funds, Private Equity Fund of Funds, LP Investor, LP Allocator, or Multi-Manager over generic Venture Capital or Private Equity.",
    "Do not add generic Financial Services as an investor classification tag.",
    "",
    `Controlled investor taxonomy: ${INVESTOR_CLASSIFICATION_TAGS.join("; ")}`,
    "",
    `Company: ${input.name}`,
    `Known description: ${input.description ?? "null"}`,
    `Known country: ${input.country ?? "null"}`,
    `Known categories: ${input.categories.join(", ") || "none"}`,
    "",
    "Website text:",
    websiteText,
  ].join("\n");
}

export async function callOllamaForCompanyEnrichment({
  input,
  websiteText,
  fetcher = fetch,
}: {
  input: EnrichmentInput;
  websiteText: string;
  fetcher?: FetchLike;
}) {
  const response = await fetcher(`${ollamaBaseUrl().replace(/\/+$/, "")}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel(),
      prompt: buildPrompt(input, websiteText),
      stream: false,
      format: "json",
      options: {
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}.`);
  }

  const payload = (await response.json()) as { response?: string };
  if (!payload.response) throw new Error("Ollama returned an empty response.");
  return parseCompanyEnrichmentJson(payload.response);
}

export async function enrichCompany(input: EnrichmentInput, fetcher: FetchLike = fetch): Promise<CompanyEnrichment> {
  const generatedAt = new Date().toISOString();

  try {
    const website = await fetchCompanyWebsiteText(input.websiteDomains, fetcher);
    const generated = await callOllamaForCompanyEnrichment({ input, websiteText: website.text, fetcher });
    const hasInvestorEvidence = hasInvestorActivityEvidence(input, website.text);
    const healthcareTrust = healthcareTrustClassification(input);
    const classificationTags = hasInvestorEvidence ? investorClassificationTagNames(generated.classificationTags ?? []) : [];
    return {
      companyId: input.companyId,
      status: "completed",
      summary: generated.summary ?? null,
      industry: healthcareTrust?.industry ?? labelIfSupported(generated.industry, hasInvestorEvidence),
      subsector: healthcareTrust?.subsector ?? labelIfSupported(generated.subsector, hasInvestorEvidence),
      companyType: healthcareTrust?.companyType ?? labelIfSupported(generated.companyType, hasInvestorEvidence),
      location: locationIfSupported(generated.location, input) ?? input.country ?? null,
      keywords: uniqueKeywords([...keywordsIfSupported(generated.keywords ?? [], hasInvestorEvidence), ...classificationTags, ...businessTagsFromText(input, website.text)]),
      sourceUrl: website.sourceUrl,
      model: ollamaModel(),
      confidence: generated.confidence ?? null,
      errorMessage: null,
      generatedAt,
      reviewedAt: null,
      updatedAt: generatedAt,
    };
  } catch (error) {
    return {
      companyId: input.companyId,
      status: input.websiteDomains.length === 0 ? "needs_review" : "failed",
      summary: null,
      industry: null,
      subsector: null,
      companyType: null,
      location: input.country,
      keywords: [],
      sourceUrl: input.websiteDomains[0] ? `https://${input.websiteDomains[0]}` : null,
      model: ollamaModel(),
      confidence: null,
      errorMessage: error instanceof Error ? error.message : String(error),
      generatedAt,
      reviewedAt: null,
      updatedAt: generatedAt,
    };
  }
}
