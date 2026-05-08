import { INVESTMENT_DEAL_STATUSES, type Company, type InvestmentDeal, type InvestmentDealStatus, type InvestmentRelationship, type Person } from "./types";

export type DealPipelineRow = {
  key: string;
  companyId: string;
  companyName: string;
  outreachStage: Company["outreachStage"];
  dealId: string;
  dealName: string;
  status: InvestmentDealStatus;
  investedAt: string | null;
  contacts: string[];
  roles: string[];
  dealNotes: string[];
  relationshipNotes: string[];
};

export type DealPipelineGroup = {
  status: InvestmentDealStatus;
  rows: DealPipelineRow[];
  total: number;
};

function addUnique(values: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return;
  }

  if (!values.some((existing) => existing.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
    values.push(normalized);
  }
}

function getLaterDate(current: string | null, next: string | null) {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  return next > current ? next : current;
}

function addDealToRows(
  rows: Map<string, DealPipelineRow>,
  company: Company,
  relationship: InvestmentRelationship,
  deal: InvestmentDeal,
  contact: Person | null,
) {
  const key = `${company.id}:${deal.id}`;
  let row = rows.get(key);

  if (!row) {
    row = {
      key,
      companyId: company.id,
      companyName: company.name,
      outreachStage: company.outreachStage,
      dealId: deal.id,
      dealName: deal.name,
      status: deal.status,
      investedAt: deal.investedAt,
      contacts: [],
      roles: [],
      dealNotes: [],
      relationshipNotes: [],
    };
    rows.set(key, row);
  }

  row.investedAt = getLaterDate(row.investedAt, deal.investedAt);
  addUnique(row.contacts, contact?.displayName);
  addUnique(row.roles, deal.role);
  addUnique(row.dealNotes, deal.notes);
  addUnique(row.relationshipNotes, relationship.notes);
}

function relationshipBelongsToCompany(relationship: InvestmentRelationship, company: Company) {
  return !relationship.companyId || relationship.companyId === company.id;
}

export function buildDealPipelineRows(companies: Company[]): DealPipelineRow[] {
  const rows = new Map<string, DealPipelineRow>();

  for (const company of companies) {
    for (const relationship of company.investmentRelationships) {
      if (!relationshipBelongsToCompany(relationship, company)) {
        continue;
      }

      for (const deal of relationship.deals) {
        addDealToRows(rows, company, relationship, deal, null);
      }
    }

    for (const person of company.people) {
      for (const relationship of person.investmentRelationships) {
        if (!relationshipBelongsToCompany(relationship, company)) {
          continue;
        }

        for (const deal of relationship.deals) {
          addDealToRows(rows, company, relationship, deal, person);
        }
      }
    }
  }

  return Array.from(rows.values()).sort((left, right) => {
    const statusDifference = INVESTMENT_DEAL_STATUSES.indexOf(left.status) - INVESTMENT_DEAL_STATUSES.indexOf(right.status);
    if (statusDifference !== 0) {
      return statusDifference;
    }

    return `${left.companyName} ${left.dealName}`.localeCompare(`${right.companyName} ${right.dealName}`);
  });
}

export function groupDealPipelineRows(rows: DealPipelineRow[]): DealPipelineGroup[] {
  const groups = new Map<InvestmentDealStatus, DealPipelineRow[]>(
    INVESTMENT_DEAL_STATUSES.map((status) => [status, []]),
  );

  for (const row of rows) {
    groups.get(row.status)?.push(row);
  }

  return INVESTMENT_DEAL_STATUSES.map((status) => {
    const statusRows = groups.get(status) ?? [];
    return {
      status,
      rows: statusRows,
      total: statusRows.length,
    };
  });
}
