import { NextResponse } from "next/server";
import { z } from "zod";

import { localEnrichmentEnabled, ollamaBaseUrl, ollamaModel } from "@/lib/enrichment-config";

export const runtime = "nodejs";

const requestSchema = z.object({
  displayName: z.string().min(1).max(240),
});

const responseSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
});

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first >= 0 && last > first) return value.slice(first, last + 1);
  return value;
}

function buildPrompt(displayName: string) {
  return [
    "You extract a person's first name and last name from a full name string.",
    "Return strict JSON only, with keys: firstName, lastName.",
    "",
    "Rules:",
    "- Strip professional suffixes: CFA, PhD, Ph.D, MD, JD, MBA, CPA, DDS, DVM, PE, RN, NP, PA, Esq, Esquire, CFP, CAIA, FRM, ACCA",
    "- Strip generational suffixes: Jr, Sr, II, III, IV, V",
    "- Strip academic suffixes: MA, MSc, BSc, BA, BS, MS, EdD, DBA, LLM, LLB",
    "- Strip honorific prefixes: Dr, Mr, Mrs, Ms, Mx, Prof, Hon, Sir, Dame, Lord, Lady",
    "- Strip post-nominal letters that follow a comma (e.g. 'John Smith, CFA' -> John / Smith)",
    "- Periods in suffixes/prefixes should be ignored (e.g. 'Ph.D.' is same as 'PhD')",
    "- If the name is in 'Last, First' format, swap them",
    "- The last remaining word is the lastName; everything before it is the firstName",
    "- If only one word remains, put it in firstName and leave lastName empty",
    "- Never include suffixes or prefixes in either firstName or lastName",
    "",
    `Full name: "${displayName}"`,
  ].join("\n");
}

export async function POST(request: Request) {
  if (!localEnrichmentEnabled()) {
    return NextResponse.json({ error: "Local enrichment is disabled." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const response = await fetch(`${ollamaBaseUrl().replace(/\/+$/, "")}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel(),
        prompt: buildPrompt(parsed.data.displayName),
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Ollama returned ${response.status}.` }, { status: 502 });
    }

    const payload = (await response.json()) as { response?: string };
    if (!payload.response) {
      return NextResponse.json({ error: "Ollama returned an empty response." }, { status: 502 });
    }

    const result = responseSchema.parse(JSON.parse(extractJson(payload.response)));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
