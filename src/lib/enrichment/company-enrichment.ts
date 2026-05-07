import { DOMParser } from "@xmldom/xmldom";
import { z } from "zod";

import { ollamaBaseUrl, ollamaModel } from "../enrichment-config";
import type { CompanyEnrichment } from "../types";

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
const REQUEST_TIMEOUT_MS = 12000;

const enrichmentResponseSchema = z.object({
  summary: z.string().trim().max(1200).nullable().optional(),
  industry: z.string().trim().max(160).nullable().optional(),
  subsector: z.string().trim().max(160).nullable().optional(),
  companyType: z.string().trim().max(160).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type GeneratedCompanyEnrichment = z.infer<typeof enrichmentResponseSchema>;

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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
  const document = new DOMParser().parseFromString(html, "text/html") as unknown as XmlDocumentLike;
  const title = cleanText(document.getElementsByTagName("title").item(0)?.textContent ?? "");
  const description = cleanText(metaContent(document, "description") || metaContent(document, "og:description"));
  const body = cleanText(textContent(document.getElementsByTagName("body").item(0) ?? document.documentElement));
  return cleanText([title, description, body].filter(Boolean).join("\n")).slice(0, MAX_WEBSITE_TEXT);
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
  const domain = domains[0];
  if (!domain) throw new Error("Company has no website domain to enrich.");

  const urls = [`https://${domain}`, `http://${domain}`];
  let lastError: unknown;

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(fetcher, url);
      if (!response.ok) {
        lastError = new Error(`${url} returned ${response.status}`);
        continue;
      }

      const html = await response.text();
      const text = extractWebsiteText(html);
      if (!text) {
        lastError = new Error(`${url} did not contain usable text`);
        continue;
      }

      return { sourceUrl: url, text };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not fetch company website.");
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

function buildPrompt(input: EnrichmentInput, websiteText: string) {
  return [
    "You enrich a private CRM record for investment outreach.",
    "Return strict JSON only, with these keys: summary, industry, subsector, companyType, location, keywords, confidence.",
    "Use null when unsure. Keep summary under 80 words. Confidence is 0 to 1.",
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
    return {
      companyId: input.companyId,
      status: "completed",
      summary: generated.summary ?? null,
      industry: generated.industry ?? null,
      subsector: generated.subsector ?? null,
      companyType: generated.companyType ?? null,
      location: generated.location ?? input.country ?? null,
      keywords: generated.keywords ?? [],
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
