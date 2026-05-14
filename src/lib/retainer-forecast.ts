import type {
  AccountingDocument,
  FundraisingRetainerCadence,
  FundraisingRetainerPeriod,
  FundraisingRetainerPeriodStatus,
} from "./types";

export const RETAINER_FORECAST_MONTHS = 6;

const CADENCE_MONTHS: Record<FundraisingRetainerCadence, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export const RETAINER_CADENCE_LABELS: Record<FundraisingRetainerCadence, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semiannual",
  annual: "Annual",
};

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function formatIsoDate(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonthsClamped(date: string, months: number) {
  const parsed = parseIsoDate(date);
  if (!parsed) return date;

  const monthIndex = parsed.month - 1 + months;
  const targetYear = parsed.year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12 + 1;
  const targetDay = Math.min(parsed.day, daysInMonth(targetYear, targetMonth));

  return formatIsoDate(targetYear, targetMonth, targetDay);
}

export function buildRetainerForecastDates(nextBillingDate: string, cadence: FundraisingRetainerCadence, forecastMonths = RETAINER_FORECAST_MONTHS) {
  const stepMonths = CADENCE_MONTHS[cadence];
  const endDate = addMonthsClamped(nextBillingDate, forecastMonths);
  const dates: string[] = [];

  for (let offset = 0; offset <= forecastMonths + stepMonths; offset += stepMonths) {
    const date = addMonthsClamped(nextBillingDate, offset);
    if (date > endDate) break;
    dates.push(date);
  }

  return dates;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function retainerStatusFromAccountingDocument(document: AccountingDocument, today = todayIsoDate()): FundraisingRetainerPeriodStatus {
  if (document.status === "void" || document.voidedAt) return "cancelled";
  if (document.status === "paid") return "paid";

  const periodDate = document.retainerPeriodDate ?? document.dueOn ?? document.issuedOn;
  if (periodDate && periodDate < today && (document.status === "draft" || document.status === "open")) return "overdue";
  if (document.status === "open" || document.status === "partially_paid") return "invoiced";

  return "pending";
}

export function buildRetainerPeriodsFromAccountingDocuments(documents: AccountingDocument[], today = todayIsoDate()): FundraisingRetainerPeriod[] {
  return documents
    .filter((document) => document.documentType === "retainer" && document.fundraisingClientId && document.retainerPeriodDate)
    .map((document) => ({
      id: document.id,
      clientId: document.fundraisingClientId as string,
      periodDate: document.retainerPeriodDate as string,
      expectedAmountMinor: document.amountMinor,
      currency: document.currency,
      status: retainerStatusFromAccountingDocument(document, today),
      accountingDocumentId: document.id,
      notes: document.notes,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }))
    .sort((left, right) => left.periodDate.localeCompare(right.periodDate));
}
