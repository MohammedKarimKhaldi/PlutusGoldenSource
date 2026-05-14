import { z } from "zod";

import { normalizeCompanyWebsites } from "./company-websites";
import { isValidPersonEmail, normalizePersonCategories, normalizePersonEmails } from "./person-update";
import {
  ACCOUNTING_DIRECTIONS,
  ACCOUNTING_DOCUMENT_STATUSES,
  ACCOUNTING_DOCUMENT_TYPES,
  ACCOUNTING_LEDGER_ENTRY_TYPES,
  CAPACITY_STATUSES,
  ENRICHMENT_STATUSES,
  FUNDRAISING_CLIENT_STAGES,
  FUNDRAISING_RETAINER_CADENCES,
  FUNDRAISING_TARGET_STAGES,
  INVESTMENT_DEAL_STATUSES,
  INVESTMENT_STATUSES,
  OUTREACH_STAGES,
} from "./types";

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
  firstName: z.string().trim().max(120).nullable().optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
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
const moneyMinorSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code."));
const nullableTrimmedTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null);

const optionalMoneyMinorSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional();
const optionalCurrencySchema = currencySchema.nullable().optional();
const linkedCompanyCreateSchema = z.object({
  name: z.string().trim().min(1).max(240),
  websiteDomains: z.array(z.string().max(320)).max(20).transform(normalizeCompanyWebsites).optional().default([]),
  description: nullableTrimmedTextSchema(5000),
  country: nullableTrimmedTextSchema(120),
  categories: z.array(z.string().trim().min(1).max(120)).max(30).optional().default([]),
});
const linkedPersonCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(240),
  email: z.string().trim().max(320).nullable().optional(),
  jobTitle: nullableTrimmedTextSchema(240),
  linkedinUrl: nullableTrimmedTextSchema(1000),
  country: nullableTrimmedTextSchema(120),
  categories: personCategoriesSchema.optional().default([]),
});

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
  generatedAt: z.string().datetime().nullable().optional(),
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

export const investmentDealStatusUpdateSchema = z.object({
  organizationId: z.string().uuid(),
  companyId: z.string().uuid(),
  dealId: z.string().uuid(),
  status: z.enum(INVESTMENT_DEAL_STATUSES),
  note: z.string().trim().max(4000).nullable().optional(),
});

export const accountingDocumentSchema = z
  .object({
    organizationId: z.string().uuid(),
    documentId: z.string().uuid().optional(),
    companyId: nullableUuidSchema,
    documentType: z.enum(ACCOUNTING_DOCUMENT_TYPES),
    status: z.enum(ACCOUNTING_DOCUMENT_STATUSES).default("open"),
    title: z.string().trim().min(1).max(240),
    amountMinor: moneyMinorSchema,
    currency: currencySchema,
    issuedOn: z.string().date().nullable().optional(),
    dueOn: z.string().date().nullable().optional(),
    externalReference: nullableTrimmedTextSchema(240),
    documentUrl: nullableTrimmedTextSchema(1000),
    notes: nullableTrimmedTextSchema(4000),
  })
  .superRefine((value, ctx) => {
    if ((value.documentType === "retainer" || value.documentType === "commission") && !value.companyId) {
      ctx.addIssue({
        code: "custom",
        message: "Retainers and commissions must be linked to a company.",
        path: ["companyId"],
      });
    }
  });

export const accountingLedgerEntrySchema = z
  .object({
    organizationId: z.string().uuid(),
    entryId: z.string().uuid().optional(),
    documentId: nullableUuidSchema,
    companyId: nullableUuidSchema,
    entryType: z.enum(ACCOUNTING_LEDGER_ENTRY_TYPES),
    direction: z.enum(ACCOUNTING_DIRECTIONS),
    amountMinor: moneyMinorSchema,
    currency: currencySchema,
    occurredOn: z.string().date(),
    externalReference: nullableTrimmedTextSchema(240),
    documentUrl: nullableTrimmedTextSchema(1000),
    notes: nullableTrimmedTextSchema(4000),
  })
  .superRefine((value, ctx) => {
    if ((value.entryType === "retainer_payment" || value.entryType === "commission_payment") && !value.companyId) {
      ctx.addIssue({
        code: "custom",
        message: "Retainer and commission payments must be linked to a company.",
        path: ["companyId"],
      });
    }

    if ((value.entryType === "retainer_payment" || value.entryType === "commission_payment") && value.direction !== "incoming") {
      ctx.addIssue({
        code: "custom",
        message: "Retainer and commission payments must be incoming.",
        path: ["direction"],
      });
    }

    if (value.entryType === "expense_payment" && value.direction !== "outgoing") {
      ctx.addIssue({
        code: "custom",
        message: "Expense payments must be outgoing.",
        path: ["direction"],
      });
    }
  });

export const accountingVoidSchema = z.object({
  organizationId: z.string().uuid(),
  entityType: z.enum(["document", "ledger_entry"]),
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});

export const accountingDeleteSchema = z.object({
  organizationId: z.string().uuid(),
  entityType: z.enum(["document", "ledger_entry"]),
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});

export const fundraisingClientSchema = z
  .object({
    organizationId: z.string().uuid(),
    clientId: z.string().uuid().optional(),
    companyId: nullableUuidSchema,
    createCompany: linkedCompanyCreateSchema.optional(),
    mandateName: z.string().trim().min(1).max(240),
    stage: z.enum(FUNDRAISING_CLIENT_STAGES),
    ownerId: nullableUuidSchema,
    primaryContactPersonId: nullableUuidSchema,
    createPrimaryContact: linkedPersonCreateSchema.optional(),
    signedOn: z.string().date().nullable().optional(),
    targetRaiseAmountMinor: optionalMoneyMinorSchema,
    targetRaiseCurrency: optionalCurrencySchema,
    retainerAmountMinor: optionalMoneyMinorSchema,
    retainerCurrency: optionalCurrencySchema,
    retainerCadence: z.enum(FUNDRAISING_RETAINER_CADENCES).nullable().optional(),
    retainerSchedule: nullableTrimmedTextSchema(120),
    retainerNextBillingDate: z.string().date().nullable().optional(),
    materialsUrl: nullableTrimmedTextSchema(1000),
    dataRoomUrl: nullableTrimmedTextSchema(1000),
    notes: nullableTrimmedTextSchema(4000),
  })
  .superRefine((value, ctx) => {
    if (!value.companyId && !value.createCompany) {
      ctx.addIssue({
        code: "custom",
        message: "Choose an existing client company or create a new one.",
        path: ["companyId"],
      });
    }

    if ((value.targetRaiseAmountMinor == null) !== (value.targetRaiseCurrency == null)) {
      ctx.addIssue({
        code: "custom",
        message: "Target raise amount and currency must be provided together.",
        path: ["targetRaiseCurrency"],
      });
    }

    if ((value.retainerAmountMinor == null) !== (value.retainerCurrency == null)) {
      ctx.addIssue({
        code: "custom",
        message: "Retainer amount and currency must be provided together.",
        path: ["retainerCurrency"],
      });
    }

    if (value.retainerAmountMinor != null && !value.retainerCadence) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a retainer cadence.",
        path: ["retainerCadence"],
      });
    }

    if (value.retainerAmountMinor != null && !value.retainerNextBillingDate) {
      ctx.addIssue({
        code: "custom",
        message: "Choose the next retainer billing date.",
        path: ["retainerNextBillingDate"],
      });
    }
  });

export const fundraisingTargetSchema = z
  .object({
    organizationId: z.string().uuid(),
    targetId: z.string().uuid().optional(),
    clientId: z.string().uuid(),
    investorCompanyId: nullableUuidSchema,
    createInvestorCompany: linkedCompanyCreateSchema.optional(),
    investorPersonId: nullableUuidSchema,
    createInvestorPerson: linkedPersonCreateSchema.optional(),
    investorName: z.string().trim().min(1).max(240),
    investorEmail: nullableTrimmedTextSchema(320),
    investorType: nullableTrimmedTextSchema(160),
    ticketSizeMinMinor: optionalMoneyMinorSchema,
    ticketSizeMaxMinor: optionalMoneyMinorSchema,
    ticketSizeCurrency: optionalCurrencySchema,
    stage: z.enum(FUNDRAISING_TARGET_STAGES),
    ownerId: nullableUuidSchema,
    lastContactedAt: z.string().datetime().nullable().optional(),
    nextStep: nullableTrimmedTextSchema(500),
    notes: nullableTrimmedTextSchema(4000),
  })
  .superRefine((value, ctx) => {
    if (value.ticketSizeMaxMinor != null && value.ticketSizeMinMinor != null && value.ticketSizeMaxMinor < value.ticketSizeMinMinor) {
      ctx.addIssue({
        code: "custom",
        message: "Maximum ticket size must be greater than or equal to the minimum.",
        path: ["ticketSizeMaxMinor"],
      });
    }

    const hasTicketAmount = value.ticketSizeMinMinor != null || value.ticketSizeMaxMinor != null;
    if (hasTicketAmount !== (value.ticketSizeCurrency != null)) {
      ctx.addIssue({
        code: "custom",
        message: "Ticket size amount and currency must be provided together.",
        path: ["ticketSizeCurrency"],
      });
    }

    if (!value.investorName && !value.investorCompanyId && !value.investorPersonId && !value.createInvestorCompany && !value.createInvestorPerson) {
      ctx.addIssue({
        code: "custom",
        message: "Add an investor name or linked CRM record.",
        path: ["investorName"],
      });
    }
  });

export const fundraisingDeleteSchema = z.object({
  organizationId: z.string().uuid(),
  entityType: z.enum(["client", "target"]),
  id: z.string().uuid(),
});
