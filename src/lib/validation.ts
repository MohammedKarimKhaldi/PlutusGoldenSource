import { z } from "zod";

import { normalizeCompanyWebsites } from "./company-websites";
import { isValidPersonEmail, normalizePersonCategories, normalizePersonEmails } from "./person-update";
import { CAPACITY_STATUSES, ENRICHMENT_STATUSES, INVESTMENT_DEAL_STATUSES, INVESTMENT_STATUSES, OUTREACH_STAGES } from "./types";

const personEmailsSchema = z
  .array(z.string().max(320))
  .max(50)
  .transform(normalizePersonEmails)
  .superRefine((emails, ctx) => {
    for (const email of emails) {
      if (!isValidPersonEmail(email)) {
        ctx.addIssue({
          code: "custom",
          message: "Enter valid email addresses.",
        });
      }
    }
  });

const personCategoriesSchema = z
  .array(z.string().max(240))
  .max(60)
  .transform(normalizePersonCategories)
  .superRefine((categories, ctx) => {
    if (categories.length > 30) {
      ctx.addIssue({
        code: "custom",
        message: "Use 30 contact tags or fewer.",
      });
    }

    for (const category of categories) {
      if (category.length > 120) {
        ctx.addIssue({
          code: "custom",
          message: "Contact tags must be 120 characters or fewer.",
        });
      }
    }
  });

export const companyUpdateSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(240).optional(),
  websiteDomains: z.array(z.string().max(320)).max(20).transform(normalizeCompanyWebsites).optional(),
  description: z.string().max(5000).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  status: z.enum(["active", "review", "archived"]).optional(),
  categories: z.array(z.string().min(1).max(120)).max(30).optional(),
});

export const personUpdateSchema = z.object({
  organizationId: z.string().uuid(),
  personId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(240),
  emails: personEmailsSchema.optional().default([]),
  jobTitle: z.string().trim().max(240).nullable().optional(),
  linkedinUrl: z.string().trim().max(1000).nullable().optional(),
  phone: z.string().trim().max(240).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  categories: personCategoriesSchema,
  syncEmails: z.boolean().optional().default(false),
});

export const peopleUpdateSchema = z.object({
  updates: z.array(personUpdateSchema).min(1).max(1000),
});

export const tagSchema = z.object({
  organizationId: z.string().uuid(),
  companyIds: z.array(z.string().uuid()).min(1),
  tagName: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#2563eb"),
});

export const tagRenameSchema = z.object({
  organizationId: z.string().uuid(),
  tagId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
});

export const noteSchema = z.object({
  organizationId: z.string().uuid(),
  companyId: z.string().uuid(),
  personId: z.string().uuid().nullable().optional(),
  body: z.string().min(1).max(5000),
});

export const highlightSchema = z.object({
  companyId: z.string().uuid(),
  personId: z.string().uuid(),
  highlighted: z.boolean(),
});

export const stageSchema = z.object({
  organizationId: z.string().uuid(),
  companyIds: z.array(z.string().uuid()).min(1),
  stage: z.enum(OUTREACH_STAGES),
});

export const activitySchema = z.object({
  organizationId: z.string().uuid(),
  companyId: z.string().uuid(),
  personId: z.string().uuid().nullable().optional(),
  outreachId: z.string().uuid().nullable().optional(),
  activityType: z.enum(["email", "call", "meeting", "note", "status_change"]),
  summary: z.string().min(1).max(240),
  body: z.string().max(5000).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
});

export const taskSchema = z.object({
  organizationId: z.string().uuid(),
  companyId: z.string().uuid(),
  personId: z.string().uuid().nullable().optional(),
  outreachId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(240),
  dueDate: z.string().date().nullable().optional(),
});

export const mergePeopleSchema = z
  .object({
    organizationId: z.string().uuid(),
    targetPersonId: z.string().uuid(),
    sourcePersonId: z.string().uuid(),
  })
  .refine((value) => value.targetPersonId !== value.sourcePersonId, {
    message: "Choose two different people to merge.",
    path: ["sourcePersonId"],
  });

export const mergeCompaniesSchema = z
  .object({
    organizationId: z.string().uuid(),
    targetCompanyId: z.string().uuid(),
    sourceCompanyIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    const uniqueSourceIds = new Set(value.sourceCompanyIds);

    if (uniqueSourceIds.size !== value.sourceCompanyIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Choose each duplicate company once.",
        path: ["sourceCompanyIds"],
      });
    }

    if (uniqueSourceIds.has(value.targetCompanyId)) {
      ctx.addIssue({
        code: "custom",
        message: "The keeper company cannot also be merged into itself.",
        path: ["sourceCompanyIds"],
      });
    }
  });

const nullableUuidSchema = z.string().uuid().nullable().optional();

export const companyEnrichmentUpdateSchema = z.object({
  organizationId: z.string().uuid(),
  companyId: z.string().uuid(),
  status: z.enum(ENRICHMENT_STATUSES).default("needs_review"),
  summary: z.string().trim().max(4000).nullable().optional(),
  industry: z.string().trim().max(160).nullable().optional(),
  subsector: z.string().trim().max(160).nullable().optional(),
  companyType: z.string().trim().max(160).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  sourceUrl: z.string().trim().max(1000).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  errorMessage: z.string().trim().max(2000).nullable().optional(),
  reviewed: z.boolean().optional().default(true),
});

export const investmentRelationshipSchema = z
  .object({
    organizationId: z.string().uuid(),
    relationshipId: z.string().uuid().optional(),
    companyId: nullableUuidSchema,
    personId: nullableUuidSchema,
    investmentStatus: z.enum(INVESTMENT_STATUSES),
    capacityStatus: z.enum(CAPACITY_STATUSES),
    notes: z.string().trim().max(4000).nullable().optional(),
    lastInvestedDate: z.string().date().nullable().optional(),
  })
  .refine((value) => Boolean(value.companyId || value.personId), {
    message: "Choose a company, contact, or both for this investment relationship.",
    path: ["companyId"],
  });

export const investmentDealSchema = z.object({
  organizationId: z.string().uuid(),
  relationshipId: z.string().uuid().optional(),
  companyId: nullableUuidSchema,
  personId: nullableUuidSchema,
  investmentStatus: z.enum(INVESTMENT_STATUSES).default("past_investor"),
  capacityStatus: z.enum(CAPACITY_STATUSES).default("unknown"),
  relationshipNotes: z.string().trim().max(4000).nullable().optional(),
  dealName: z.string().trim().min(1).max(240),
  dealStatus: z.enum(INVESTMENT_DEAL_STATUSES),
  investedAt: z.string().date().nullable().optional(),
  role: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
}).refine((value) => Boolean(value.relationshipId || value.companyId || value.personId), {
  message: "Choose an investment relationship, company, or contact for this deal.",
  path: ["relationshipId"],
});
