"use client";

import { useEffect, useDeferredValue, useMemo, useState } from "react";

import {
  deleteAccountingRecordAction,
  saveAccountingDocumentAction,
  saveAccountingLedgerEntryAction,
  voidAccountingRecordAction,
} from "@/app/actions";
import {
  ACCOUNTING_DIRECTION_LABELS,
  ACCOUNTING_DOCUMENT_STATUS_LABELS,
  ACCOUNTING_DOCUMENT_TYPE_LABELS,
  ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS,
  amountInputFromMinor,
  parseMoneyInput,
} from "@/components/shared";
import type {
  AccountingDocumentDraft,
  AccountingLedgerDraft,
} from "@/components/shared";
import {
  defaultAccountingDocumentDraft,
  defaultAccountingLedgerDraft,
} from "@/components/views/accounting/accounting-view";
import type {
  AccountingRecordActionTarget,
  AccountingTab, ActiveView,
} from "@/lib/crm-types";
import {
  accountingSearchParts,
  emptyAccountingData,
  withAccountingSummaries,
} from "@/lib/crm-utils";
import type {
  AccountingData,
  AccountingDocument,
  AccountingLedgerEntry,
  Company,
  DashboardData,
} from "@/lib/types";

type UseCrmAccountingOptions = {
  initialData: DashboardData;
  accountingData: AccountingData;
  setAccountingData: React.Dispatch<React.SetStateAction<AccountingData>>;
  companies: Company[];
  companyNameById: Map<string, string>;
  setActiveView: React.Dispatch<React.SetStateAction<ActiveView>>;
};

export function useCrmAccounting(options: UseCrmAccountingOptions) {
  const {
    initialData,
    accountingData,
    setAccountingData,
    companies,
    companyNameById,
    setActiveView,
  } = options;

  const [accountingTab, setAccountingTab] = useState<AccountingTab>("documents");
  const [accountingQuery, setAccountingQuery] = useState("");
  const [accountingCompanyFilter, setAccountingCompanyFilter] = useState("");
  const [accountingTypeFilter, setAccountingTypeFilter] = useState("");
  const [accountingStatusFilter, setAccountingStatusFilter] = useState("");
  const [accountingCurrencyFilter, setAccountingCurrencyFilter] = useState("");
  const [accountingDateFrom, setAccountingDateFrom] = useState("");
  const [accountingDateTo, setAccountingDateTo] = useState("");
  const [accountingDocumentDraft, setAccountingDocumentDraft] = useState<AccountingDocumentDraft>(() => defaultAccountingDocumentDraft());
  const [accountingLedgerDraft, setAccountingLedgerDraft] = useState<AccountingLedgerDraft>(() => defaultAccountingLedgerDraft());
  const [accountingRecordActionTarget, setAccountingRecordActionTarget] = useState<AccountingRecordActionTarget | null>(null);
  const [accountingRecordActionReason, setAccountingRecordActionReason] = useState("");
  const [accountingMessage, setAccountingMessage] = useState<string | null>(null);
  const [isSavingAccounting, setIsSavingAccounting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setAccountingData(initialData.accounting ?? emptyAccountingData());
    });
    return () => { cancelled = true; };
  }, [initialData.accounting, setAccountingData]);

  const deferredAccountingQuery = useDeferredValue(accountingQuery.trim().toLowerCase());

  const accountingCompanies = useMemo(
    () =>
      companies
        .filter((company) => accountingData.documents.some((document) => document.companyId === company.id) || accountingData.ledgerEntries.some((entry) => entry.companyId === company.id))
        .sort((left, right) => left.name.localeCompare(right.name, "en-US")),
    [accountingData.documents, accountingData.ledgerEntries, companies],
  );

  const accountingCurrencies = useMemo(
    () => [...new Set([...accountingData.documents.map((document) => document.currency), ...accountingData.ledgerEntries.map((entry) => entry.currency)])].sort(),
    [accountingData.documents, accountingData.ledgerEntries],
  );

  const filteredAccountingDocuments = useMemo(
    () =>
      accountingData.documents.filter((document) => {
        const dateValue = document.issuedOn ?? document.createdAt.slice(0, 10);
        if (accountingCompanyFilter && document.companyId !== accountingCompanyFilter) return false;
        if (accountingTypeFilter && document.documentType !== accountingTypeFilter) return false;
        if (accountingStatusFilter && document.status !== accountingStatusFilter) return false;
        if (accountingCurrencyFilter && document.currency !== accountingCurrencyFilter) return false;
        if (accountingDateFrom && dateValue < accountingDateFrom) return false;
        if (accountingDateTo && dateValue > accountingDateTo) return false;
        if (!deferredAccountingQuery) return true;
        const searchText = accountingSearchParts([
          document.title,
          document.externalReference,
          document.notes,
          document.currency,
          document.companyId ? companyNameById.get(document.companyId) : "General",
          ACCOUNTING_DOCUMENT_TYPE_LABELS[document.documentType],
          ACCOUNTING_DOCUMENT_STATUS_LABELS[document.status],
        ]);
        return searchText.includes(deferredAccountingQuery);
      }),
    [accountingCompanyFilter, accountingCurrencyFilter, accountingData.documents, accountingDateFrom, accountingDateTo, accountingStatusFilter, accountingTypeFilter, companyNameById, deferredAccountingQuery],
  );

  const filteredAccountingEntries = useMemo(
    () =>
      accountingData.ledgerEntries.filter((entry) => {
        if (accountingCompanyFilter && entry.companyId !== accountingCompanyFilter) return false;
        if (accountingTypeFilter && entry.entryType !== accountingTypeFilter) return false;
        if (accountingStatusFilter === "voided" && !entry.voidedAt) return false;
        if (accountingStatusFilter === "active" && entry.voidedAt) return false;
        if (accountingCurrencyFilter && entry.currency !== accountingCurrencyFilter) return false;
        if (accountingDateFrom && entry.occurredOn < accountingDateFrom) return false;
        if (accountingDateTo && entry.occurredOn > accountingDateTo) return false;
        if (!deferredAccountingQuery) return true;
        const linkedDocument = accountingData.documents.find((document) => document.id === entry.documentId);
        const searchText = accountingSearchParts([
          entry.externalReference,
          entry.notes,
          entry.currency,
          linkedDocument?.title,
          entry.companyId ? companyNameById.get(entry.companyId) : "General",
          ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[entry.entryType],
          ACCOUNTING_DIRECTION_LABELS[entry.direction],
        ]);
        return searchText.includes(deferredAccountingQuery);
      }),
    [accountingCompanyFilter, accountingCurrencyFilter, accountingData.documents, accountingData.ledgerEntries, accountingDateFrom, accountingDateTo, accountingStatusFilter, accountingTypeFilter, companyNameById, deferredAccountingQuery],
  );

  function updateAccountingDocumentLocally(document: AccountingDocument) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        documents: current.documents.some((item) => item.id === document.id)
          ? current.documents.map((item) => (item.id === document.id ? document : item))
          : [document, ...current.documents],
      }),
    );
  }

  function updateAccountingLedgerEntryLocally(entry: AccountingLedgerEntry) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        ledgerEntries: current.ledgerEntries.some((item) => item.id === entry.id)
          ? current.ledgerEntries.map((item) => (item.id === entry.id ? entry : item))
          : [entry, ...current.ledgerEntries],
      }),
    );
  }

  function deleteAccountingDocumentLocally(documentId: string) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        documents: current.documents.filter((document) => document.id !== documentId),
        ledgerEntries: current.ledgerEntries.map((entry) => (entry.documentId === documentId ? { ...entry, documentId: null } : entry)),
      }),
    );
  }

  function deleteAccountingLedgerEntryLocally(entryId: string) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        ledgerEntries: current.ledgerEntries.filter((entry) => entry.id !== entryId),
      }),
    );
  }

  function localAccountingDocumentFromDraft(draft: AccountingDocumentDraft, amountMinor: number): AccountingDocument {
    const now = new Date().toISOString();
    return {
      id: draft.documentId ?? `local-accounting-document-${Date.now()}`,
      companyId: draft.companyId || null,
      documentType: draft.documentType,
      status: draft.status,
      title: draft.title.trim(),
      amountMinor,
      currency: draft.currency.trim().toUpperCase(),
      issuedOn: draft.issuedOn || null,
      dueOn: draft.dueOn || null,
      externalReference: draft.externalReference.trim() || null,
      documentUrl: draft.documentUrl.trim() || null,
      notes: draft.notes.trim() || null,
      createdBy: null,
      updatedBy: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function localAccountingLedgerEntryFromDraft(draft: AccountingLedgerDraft, amountMinor: number): AccountingLedgerEntry {
    const now = new Date().toISOString();
    return {
      id: draft.entryId ?? `local-accounting-entry-${Date.now()}`,
      documentId: draft.documentId || null,
      companyId: draft.companyId || null,
      entryType: draft.entryType,
      direction: draft.direction,
      amountMinor,
      currency: draft.currency.trim().toUpperCase(),
      occurredOn: draft.occurredOn,
      externalReference: draft.externalReference.trim() || null,
      documentUrl: draft.documentUrl.trim() || null,
      notes: draft.notes.trim() || null,
      createdBy: null,
      updatedBy: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function saveAccountingDocument() {
    if (!initialData.accountingAccess.canEdit || isSavingAccounting) return;
    const amountMinor = parseMoneyInput(accountingDocumentDraft.amount);
    if (!amountMinor) {
      setAccountingMessage("Enter a positive amount with up to two decimals.");
      return;
    }
    if ((accountingDocumentDraft.documentType === "retainer" || accountingDocumentDraft.documentType === "commission") && !accountingDocumentDraft.companyId) {
      setAccountingMessage("Retainers and commissions must be linked to a company.");
      return;
    }

    const currency = accountingDocumentDraft.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setAccountingMessage("Use a 3-letter ISO currency code.");
      return;
    }

    setIsSavingAccounting(true);
    setAccountingMessage(null);
    try {
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving accounting data.");
          return;
        }

        const result = await saveAccountingDocumentAction({
          organizationId,
          documentId: accountingDocumentDraft.documentId ?? undefined,
          companyId: accountingDocumentDraft.companyId || null,
          documentType: accountingDocumentDraft.documentType,
          status: accountingDocumentDraft.status,
          title: accountingDocumentDraft.title,
          amountMinor,
          currency,
          issuedOn: accountingDocumentDraft.issuedOn || null,
          dueOn: accountingDocumentDraft.dueOn || null,
          externalReference: accountingDocumentDraft.externalReference || null,
          documentUrl: accountingDocumentDraft.documentUrl || null,
          notes: accountingDocumentDraft.notes || null,
        });
        setAccountingMessage(result.message);
        if (result.ok && result.document) {
          updateAccountingDocumentLocally(result.document);
          setAccountingDocumentDraft(defaultAccountingDocumentDraft());
        }
        return;
      }

      updateAccountingDocumentLocally(localAccountingDocumentFromDraft(accountingDocumentDraft, amountMinor));
      setAccountingDocumentDraft(defaultAccountingDocumentDraft());
      setAccountingMessage("Demo accounting document saved locally.");
    } finally {
      setIsSavingAccounting(false);
    }
  }

  async function saveAccountingLedgerEntry() {
    if (!initialData.accountingAccess.canEdit || isSavingAccounting) return;
    const amountMinor = parseMoneyInput(accountingLedgerDraft.amount);
    if (!amountMinor) {
      setAccountingMessage("Enter a positive amount with up to two decimals.");
      return;
    }

    const linkedDocument = accountingData.documents.find((document) => document.id === accountingLedgerDraft.documentId);
    const companyId = accountingLedgerDraft.companyId || linkedDocument?.companyId || "";
    const currency = accountingLedgerDraft.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setAccountingMessage("Use a 3-letter ISO currency code.");
      return;
    }
    if ((accountingLedgerDraft.entryType === "retainer_payment" || accountingLedgerDraft.entryType === "commission_payment") && !companyId) {
      setAccountingMessage("Retainer and commission payments must be linked to a company.");
      return;
    }

    setIsSavingAccounting(true);
    setAccountingMessage(null);
    try {
      const draft = { ...accountingLedgerDraft, companyId, currency };
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving accounting data.");
          return;
        }

        const result = await saveAccountingLedgerEntryAction({
          organizationId,
          entryId: draft.entryId ?? undefined,
          documentId: draft.documentId || null,
          companyId: draft.companyId || null,
          entryType: draft.entryType,
          direction: draft.direction,
          amountMinor,
          currency,
          occurredOn: draft.occurredOn,
          externalReference: draft.externalReference || null,
          documentUrl: draft.documentUrl || null,
          notes: draft.notes || null,
        });
        setAccountingMessage(result.message);
        if (result.ok && result.entry) {
          updateAccountingLedgerEntryLocally(result.entry);
          setAccountingLedgerDraft(defaultAccountingLedgerDraft());
        }
        return;
      }

      updateAccountingLedgerEntryLocally(localAccountingLedgerEntryFromDraft(draft, amountMinor));
      setAccountingLedgerDraft(defaultAccountingLedgerDraft());
      setAccountingMessage("Demo ledger entry saved locally.");
    } finally {
      setIsSavingAccounting(false);
    }
  }

  function openAccountingDocumentAction(document: AccountingDocument, action: AccountingRecordActionTarget["action"]) {
    if (!initialData.accountingAccess.canEdit || (action === "void" && (document.status === "void" || document.voidedAt))) return;
    setAccountingRecordActionTarget({ action, entityType: "document", id: document.id, title: document.title });
    setAccountingRecordActionReason("");
    setAccountingMessage(null);
  }

  function openAccountingLedgerAction(entry: AccountingLedgerEntry, action: AccountingRecordActionTarget["action"]) {
    if (!initialData.accountingAccess.canEdit || (action === "void" && entry.voidedAt)) return;
    const linkedDocument = accountingData.documents.find((document) => document.id === entry.documentId);
    setAccountingRecordActionTarget({
      action,
      entityType: "ledger_entry",
      id: entry.id,
      title: linkedDocument?.title ?? entry.externalReference ?? ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[entry.entryType],
    });
    setAccountingRecordActionReason("");
    setAccountingMessage(null);
  }

  function closeAccountingRecordActionDialog() {
    setAccountingRecordActionTarget(null);
    setAccountingRecordActionReason("");
  }

  async function confirmAccountingRecordAction() {
    const reason = accountingRecordActionReason.trim();
    if (!accountingRecordActionTarget || !reason) return;

    const target = accountingRecordActionTarget;
    setIsSavingAccounting(true);
    try {
      let ok = false;
      if (target.entityType === "document") {
        const document = accountingData.documents.find((item) => item.id === target.id);
        ok = target.action === "delete" ? await deleteAccountingDocument(document, reason) : await voidAccountingDocument(document, reason);
      } else {
        const entry = accountingData.ledgerEntries.find((item) => item.id === target.id);
        ok = target.action === "delete" ? await deleteAccountingLedgerEntry(entry, reason) : await voidAccountingLedgerEntry(entry, reason);
      }

      if (ok) closeAccountingRecordActionDialog();
    } catch (error) {
      setAccountingMessage(error instanceof Error ? error.message : `Could not ${target.action} accounting record.`);
    } finally {
      setIsSavingAccounting(false);
    }
  }

  async function voidAccountingDocument(document: AccountingDocument | undefined, reason: string) {
    if (!document || !initialData.accountingAccess.canEdit || document.status === "void" || document.voidedAt) return false;
    const voidReason = reason.trim();
    if (!voidReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before voiding accounting data.");
        return false;
      }

      const result = await voidAccountingRecordAction({ organizationId, entityType: "document", id: document.id, reason: voidReason });
      setAccountingMessage(result.message);
      if (result.ok && result.document) updateAccountingDocumentLocally(result.document);
      return result.ok;
    }

    updateAccountingDocumentLocally({
      ...document,
      status: "void",
      voidedAt: new Date().toISOString(),
      voidReason,
      updatedAt: new Date().toISOString(),
    });
    setAccountingMessage("Demo accounting document voided locally.");
    return true;
  }

  async function voidAccountingLedgerEntry(entry: AccountingLedgerEntry | undefined, reason: string) {
    if (!entry || !initialData.accountingAccess.canEdit || entry.voidedAt) return false;
    const voidReason = reason.trim();
    if (!voidReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before voiding accounting data.");
        return false;
      }

      const result = await voidAccountingRecordAction({ organizationId, entityType: "ledger_entry", id: entry.id, reason: voidReason });
      setAccountingMessage(result.message);
      if (result.ok && result.entry) updateAccountingLedgerEntryLocally(result.entry);
      return result.ok;
    }

    updateAccountingLedgerEntryLocally({
      ...entry,
      voidedAt: new Date().toISOString(),
      voidReason,
      updatedAt: new Date().toISOString(),
    });
    setAccountingMessage("Demo ledger entry voided locally.");
    return true;
  }

  async function deleteAccountingDocument(document: AccountingDocument | undefined, reason: string) {
    if (!document || !initialData.accountingAccess.canEdit) return false;
    const deleteReason = reason.trim();
    if (!deleteReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting accounting data.");
        return false;
      }

      const result = await deleteAccountingRecordAction({ organizationId, entityType: "document", id: document.id, reason: deleteReason });
      setAccountingMessage(result.message);
      if (result.ok) {
        deleteAccountingDocumentLocally(document.id);
        if (accountingDocumentDraft.documentId === document.id) setAccountingDocumentDraft(defaultAccountingDocumentDraft());
        if (accountingLedgerDraft.documentId === document.id) setAccountingLedgerDraft((current) => ({ ...current, documentId: "" }));
      }
      return result.ok;
    }

    deleteAccountingDocumentLocally(document.id);
    if (accountingDocumentDraft.documentId === document.id) setAccountingDocumentDraft(defaultAccountingDocumentDraft());
    if (accountingLedgerDraft.documentId === document.id) setAccountingLedgerDraft((current) => ({ ...current, documentId: "" }));
    setAccountingMessage("Demo accounting document deleted locally.");
    return true;
  }

  async function deleteAccountingLedgerEntry(entry: AccountingLedgerEntry | undefined, reason: string) {
    if (!entry || !initialData.accountingAccess.canEdit) return false;
    const deleteReason = reason.trim();
    if (!deleteReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting accounting data.");
        return false;
      }

      const result = await deleteAccountingRecordAction({ organizationId, entityType: "ledger_entry", id: entry.id, reason: deleteReason });
      setAccountingMessage(result.message);
      if (result.ok) {
        deleteAccountingLedgerEntryLocally(entry.id);
        if (accountingLedgerDraft.entryId === entry.id) setAccountingLedgerDraft(defaultAccountingLedgerDraft());
      }
      return result.ok;
    }

    deleteAccountingLedgerEntryLocally(entry.id);
    if (accountingLedgerDraft.entryId === entry.id) setAccountingLedgerDraft(defaultAccountingLedgerDraft());
    setAccountingMessage("Demo ledger entry deleted locally.");
    return true;
  }

  function handleLedgerDocumentChange(documentId: string) {
    const document = accountingData.documents.find((item) => item.id === documentId);
    setAccountingLedgerDraft((current) => ({
      ...current,
      documentId,
      companyId: document?.companyId ?? current.companyId,
      amount: document ? amountInputFromMinor(document.amountMinor) : current.amount,
      currency: document?.currency ?? current.currency,
      entryType:
        document?.documentType === "retainer"
          ? "retainer_payment"
          : document?.documentType === "commission"
            ? "commission_payment"
            : document?.documentType === "expense"
              ? "expense_payment"
              : current.entryType,
      direction: document?.documentType === "expense" ? "outgoing" : document ? "incoming" : current.direction,
    }));
  }

  function openAccountingForFundraisingCompany(companyId: string) {
    if (!initialData.accountingAccess.canView) return;
    setAccountingCompanyFilter(companyId);
    setAccountingTab("documents");
    setActiveView("accounting");
  }

  return {
    accountingTab,
    setAccountingTab,
    accountingQuery,
    setAccountingQuery,
    accountingMessage,
    setAccountingMessage,
    accountingDocumentDraft,
    setAccountingDocumentDraft,
    accountingLedgerDraft,
    setAccountingLedgerDraft,
    accountingCompanyFilter,
    setAccountingCompanyFilter,
    accountingTypeFilter,
    setAccountingTypeFilter,
    accountingStatusFilter,
    setAccountingStatusFilter,
    accountingCurrencyFilter,
    setAccountingCurrencyFilter,
    accountingDateFrom,
    setAccountingDateFrom,
    accountingDateTo,
    setAccountingDateTo,
    isSavingAccounting,
    setIsSavingAccounting,
    accountingRecordActionTarget,
    setAccountingRecordActionReason,
    accountingRecordActionReason,
    filteredAccountingDocuments,
    filteredAccountingEntries,
    accountingCompanies,
    accountingCurrencies,
    saveAccountingDocument,
    saveAccountingLedgerEntry,
    handleLedgerDocumentChange,
    openAccountingDocumentAction,
    openAccountingLedgerAction,
    closeAccountingRecordActionDialog,
    confirmAccountingRecordAction,
    openAccountingForFundraisingCompany,
  };
}
