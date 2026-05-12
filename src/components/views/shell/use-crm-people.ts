"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { formatNumber, isUuid } from "@/components/shared";
import type { PeoplePageSize, TagSummary } from "@/components/shared";
import { normalizePersonCategories } from "@/lib/person-update";
import {
  INCORRECT_EMAIL_TAG,
  emailDomain,
  extractEmailsFromText,
  groupPeopleDirectory,
  mergePersonDetails,
  personMatches,
  personSourceIds,
  uniqueTags,
  uniqueValues,
} from "@/lib/crm-utils";
import {
  highlightPersonAction,
  mergePeopleAction,
  renameCompanyTagAction,
  updatePersonAction,
} from "@/app/actions";
import type { PendingChange } from "@/lib/crm-types";
import type { Company, DashboardData, Person, Tag } from "@/lib/types";

type UseCrmPeopleOptions = {
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  queuePendingChange: (change: PendingChange) => void;
  queuePersonUpdate: (person: Person, label: string, options?: { syncEmails?: boolean }) => void;
  initialData: DashboardData;
};

export function useCrmPeople(options: UseCrmPeopleOptions) {
  const { companies, setCompanies, queuePendingChange, queuePersonUpdate, initialData } = options;

  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleCompany, setPeopleCompany] = useState("");
  const [peopleDomain, setPeopleDomain] = useState("");
  const [peopleStage, setPeopleStage] = useState("");
  const [peopleHighlight, setPeopleHighlight] = useState("");
  const [peoplePageSize, setPeoplePageSize] = useState<PeoplePageSize>(250);
  const [peoplePage, setPeoplePage] = useState(1);
  const [personMergeTargetId, setPersonMergeTargetId] = useState<string | null>(null);
  const [personMergeQuery, setPersonMergeQuery] = useState("");
  const [peopleMessage, setPeopleMessage] = useState<string | null>(null);
  const [incorrectEmails, setIncorrectEmails] = useState<Set<string>>(new Set());
  const [incorrectEmailMessage, setIncorrectEmailMessage] = useState<string | null>(null);
  const [isSplittingNames, setIsSplittingNames] = useState(false);
  const [splitNamesProgress, setSplitNamesProgress] = useState<{ total: number; completed: number; failed: number } | null>(null);
  const [namesMessage, setNamesMessage] = useState<string | null>(null);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});

  const deferredPeopleQuery = useDeferredValue(peopleQuery.trim().toLowerCase());

  const peopleRelationRows = useMemo(
    () => companies.flatMap((company) => company.people.map((person) => ({ person, company }))),
    [companies],
  );

  const peopleDirectory = useMemo(() => groupPeopleDirectory(peopleRelationRows), [peopleRelationRows]);

  const filteredPeopleDirectory = useMemo(
    () =>
      peopleDirectory.filter(({ person, companies }) =>
        personMatches({
          person,
          companies,
          query: deferredPeopleQuery,
          companyFilter: peopleCompany,
          domainFilter: peopleDomain,
          stageFilter: peopleStage,
          highlightFilter: peopleHighlight,
        }),
      ),
    [deferredPeopleQuery, peopleCompany, peopleDomain, peopleDirectory, peopleHighlight, peopleStage],
  );

  const peopleTotalPages = peoplePageSize === "all" ? 1 : Math.max(1, Math.ceil(filteredPeopleDirectory.length / peoplePageSize));
  const effectivePeoplePage = Math.min(peoplePage, peopleTotalPages);

  const visiblePeopleDirectory = useMemo(() => {
    if (peoplePageSize === "all") return filteredPeopleDirectory;
    const start = (effectivePeoplePage - 1) * peoplePageSize;
    return filteredPeopleDirectory.slice(start, start + peoplePageSize);
  }, [effectivePeoplePage, filteredPeopleDirectory, peoplePageSize]);

  const peopleStart = filteredPeopleDirectory.length === 0 ? 0 : peoplePageSize === "all" ? 1 : (effectivePeoplePage - 1) * peoplePageSize + 1;
  const peopleEnd = peoplePageSize === "all" ? filteredPeopleDirectory.length : Math.min(peopleStart + peoplePageSize - 1, filteredPeopleDirectory.length);

  const personMergeTarget = peopleDirectory.find(({ person }) => person.id === personMergeTargetId) ?? null;

  const personMergeCandidates = useMemo(() => {
    if (!personMergeTarget) return [];
    const query = personMergeQuery.trim().toLowerCase();
    return peopleDirectory
      .filter(({ person }) => person.id !== personMergeTarget.person.id)
      .filter(({ person, companies }) => {
        if (!query) return true;
        const text = [person.displayName, person.jobTitle, companies.map((company) => company.name).join(" "), person.emails.join(" "), person.linkedinUrl ?? ""].join(" ").toLowerCase();
        return text.includes(query);
      })
      .slice(0, 10);
  }, [peopleDirectory, personMergeQuery, personMergeTarget]);

  const peopleCompanyNames = useMemo(() => uniqueValues(companies, (company) => company.name), [companies]);
  const peopleEmailDomains = useMemo(
    () => [...new Set(peopleDirectory.flatMap(({ person }) => person.emails.map(emailDomain)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en-US")),
    [peopleDirectory],
  );

  const tagSummaries = useMemo(() => {
    const companyTags = new Map<string, Extract<TagSummary, { type: "company" }>>();
    const contactTags = new Map<string, Extract<TagSummary, { type: "contact" }>>();

    companies.forEach((company) => {
      company.tags.forEach((tag) => {
        const key = `company:${tag.id}`;
        const current = companyTags.get(key);
        if (current) current.count += 1;
        else companyTags.set(key, { key, type: "company", id: tag.id, name: tag.name, color: tag.color, count: 1 });
      });
    });

    peopleDirectory.forEach(({ person }) => {
      person.categories.forEach((category) => {
        const key = `contact:${category.toLowerCase()}`;
        const current = contactTags.get(key);
        if (current) current.count += 1;
        else contactTags.set(key, { key, type: "contact", name: category, count: 1 });
      });
    });

    return [...companyTags.values(), ...contactTags.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.name.localeCompare(b.name, "en-US");
    });
  }, [companies, peopleDirectory]);

  function updatePersonLocally(targetPersonIds: string[], updates: Partial<Pick<Person, "displayName" | "firstName" | "lastName" | "emails" | "jobTitle" | "linkedinUrl" | "phone" | "country" | "categories" | "investmentRelationships">>) {
    const personIdSet = new Set(targetPersonIds);
    setCompanies((current) =>
      current.map((company) => ({
        ...company,
        people: company.people.map((person) =>
          person.sourcePersonIds.some((personId) => personIdSet.has(personId))
            ? {
                ...person,
                ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
                ...(updates.firstName !== undefined ? { firstName: updates.firstName } : {}),
                ...(updates.lastName !== undefined ? { lastName: updates.lastName } : {}),
                ...(updates.emails !== undefined ? { email: updates.emails[0] ?? null, emails: updates.emails } : {}),
                ...(updates.jobTitle !== undefined ? { jobTitle: updates.jobTitle } : {}),
                ...(updates.linkedinUrl !== undefined ? { linkedinUrl: updates.linkedinUrl } : {}),
                ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
                ...(updates.country !== undefined ? { country: updates.country } : {}),
                ...(updates.categories !== undefined ? { categories: updates.categories } : {}),
                ...(updates.investmentRelationships !== undefined ? { investmentRelationships: updates.investmentRelationships } : {}),
              }
            : person,
        ),
      })),
    );
  }

  function applyCategoryToPeople(people: Person[], category: string, previousCategory?: string) {
    return people.map((person) => {
      const renamedCategories = previousCategory
        ? person.categories.map((item) => (item === previousCategory ? category : item))
        : person.categories;
      return {
        ...person,
        categories: normalizePersonCategories([...renamedCategories, category]),
      };
    });
  }

  function toggleHighlight(companyId: string, person: Person) {
    const targetPersonIds = personSourceIds(person);
    setCompanies((current) =>
      current.map((company) =>
        company.id === companyId
          ? {
              ...company,
              people: company.people.map((item) =>
                item.sourcePersonIds.some((personId) => targetPersonIds.includes(personId))
                  ? { ...item, highlighted: !item.highlighted }
                  : item,
              ),
            }
          : company,
      ),
    );

    for (const personId of targetPersonIds) {
      queuePendingChange({
        key: `highlight:${companyId}:${personId}`,
        label: "Highlight update",
        record: {
          kind: "highlight",
          key: `highlight:${companyId}:${personId}`,
          label: "Highlight update",
          companyId,
          personId,
          highlighted: !person.highlighted,
        },
        run: () =>
          initialData.authMode === "supabase" && isUuid(companyId) && isUuid(personId)
            ? highlightPersonAction({ companyId, personId, highlighted: !person.highlighted })
            : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
      });
    }
  }

  async function importIncorrectEmailsCsv(file: File) {
    const text = await file.text();
    const uploadedEmails = extractEmailsFromText(text);
    const uploadedEmailSet = new Set(uploadedEmails);

    if (uploadedEmails.length === 0) {
      setIncorrectEmailMessage("No email addresses were found in that CSV.");
      return;
    }

    const matchedEmails = new Set<string>();
    const matchedPeople = new Map<string, Person>();

    for (const { person } of peopleDirectory) {
      const matchingPersonEmails = person.emails.filter((email) => uploadedEmailSet.has(email.toLowerCase()));
      if (matchingPersonEmails.length === 0) continue;

      matchingPersonEmails.forEach((email) => matchedEmails.add(email.toLowerCase()));
      matchedPeople.set(person.id, {
        ...person,
        categories: normalizePersonCategories([...person.categories, INCORRECT_EMAIL_TAG]),
      });
    }

    if (matchedPeople.size === 0) {
      setIncorrectEmailMessage(`Found ${formatNumber(uploadedEmails.length)} email${uploadedEmails.length === 1 ? "" : "s"} in the CSV, but none matched current contacts.`);
      return;
    }

    setIncorrectEmails((current) => new Set([...current, ...matchedEmails]));
    setPeoplePage(1);
    setPeopleQuery(INCORRECT_EMAIL_TAG);
    matchedPeople.forEach((person) => {
      updatePersonLocally(personSourceIds(person), {
        displayName: person.displayName,
        emails: person.emails,
        categories: person.categories,
      });
      queuePersonUpdate(person, "Incorrect email tag", { syncEmails: false });
    });

    setIncorrectEmailMessage(
      `Tagged ${formatNumber(matchedPeople.size)} contact${matchedPeople.size === 1 ? "" : "s"} from ${formatNumber(matchedEmails.size)} matching email${matchedEmails.size === 1 ? "" : "s"}.`,
    );
  }

  function handleIncorrectEmailCsvUpload(file: File | null) {
    if (!file) return;
    void importIncorrectEmailsCsv(file);
  }

  async function splitPeopleNames() {
    const targetPeople = peopleDirectory.map((row) => row.person).filter((person) => !person.firstName);
    if (targetPeople.length === 0) {
      setNamesMessage("No contacts to split.");
      return;
    }

    setIsSplittingNames(true);
    setNamesMessage(null);
    let completed = 0;
    let failed = 0;
    setSplitNamesProgress({ total: targetPeople.length, completed, failed });

    for (const person of targetPeople) {
      setNamesMessage(`Splitting ${completed + failed + 1} of ${targetPeople.length}: ${person.displayName}`);
      setSplitNamesProgress({ total: targetPeople.length, completed, failed });

      try {
        const response = await fetch("/api/enrichment/split-name", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName: person.displayName }),
        });

        if (!response.ok) {
          failed += 1;
          continue;
        }

        const { firstName, lastName } = (await response.json()) as { firstName: string; lastName: string };
        const sourceIds = personSourceIds(person);
        updatePersonLocally(sourceIds, { firstName, lastName });

        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (organizationId) {
          queuePendingChange({
            key: `person:${person.id}`,
            label: "Contact name split",
            type: "person",
            personUpdate: {
              organizationId,
              personId: person.id,
              displayName: person.displayName,
              firstName,
              lastName,
              categories: person.categories,
            },
            record: {
              kind: "person",
              key: `person:${person.id}`,
              label: "Contact name split",
              personUpdate: {
                organizationId,
                personId: person.id,
                displayName: person.displayName,
                firstName,
                lastName,
                categories: person.categories,
              },
            },
            run: () =>
              initialData.authMode === "supabase" && organizationId
                ? updatePersonAction({
                    organizationId,
                    personId: person.id,
                    displayName: person.displayName,
                    firstName,
                    lastName,
                    categories: person.categories,
                    emails: [],
                  })
                : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
          });
        }

        completed += 1;
      } catch {
        failed += 1;
      }

      setSplitNamesProgress({ total: targetPeople.length, completed, failed });
    }

    setNamesMessage(`Name splitting done: ${completed} split${failed ? `, ${failed} failed` : ""}. Queue changes before pushing.`);
    setSplitNamesProgress(null);
    setIsSplittingNames(false);
  }

  function startManualMerge(targetPersonId: string, searchHint = "") {
    setPeopleMessage(null);
    setPersonMergeTargetId(targetPersonId);
    setPersonMergeQuery(searchHint);
  }

  function closeManualMerge() {
    setPersonMergeTargetId(null);
    setPersonMergeQuery("");
  }

  function mergePeopleLocally(targetPersonId: string, sourcePersonId: string) {
    const targetEntry = peopleDirectory.find(({ person }) => person.id === targetPersonId);
    const sourceEntry = peopleDirectory.find(({ person }) => person.id === sourcePersonId);
    if (!targetEntry || !sourceEntry) return;

    const mergedGlobalPerson = mergePersonDetails(targetEntry.person, sourceEntry.person, targetPersonId);
    setCompanies((current) =>
      current.map((company) => {
        const targetPerson = company.people.find((person) => person.id === targetPersonId) ?? null;
        const sourcePerson = company.people.find((person) => person.id === sourcePersonId) ?? null;
        if (!targetPerson && !sourcePerson) return company;

        const mergedCompanyPerson = targetPerson && sourcePerson
          ? mergePersonDetails(targetPerson, sourcePerson, targetPersonId)
          : targetPerson
            ? mergePersonDetails(targetPerson, mergedGlobalPerson, targetPersonId)
            : mergePersonDetails(mergedGlobalPerson, sourcePerson!, targetPersonId);

        const nextPeople: Person[] = [];
        let inserted = false;
        for (const person of company.people) {
          if (person.id === targetPersonId || person.id === sourcePersonId) {
            if (!inserted) {
              nextPeople.push(mergedCompanyPerson);
              inserted = true;
            }
            continue;
          }
          nextPeople.push(person);
        }

        if (!inserted) nextPeople.push(mergedCompanyPerson);
        return { ...company, people: nextPeople };
      }),
    );
  }

  function handleManualMerge(sourcePersonId: string) {
    if (!personMergeTarget || sourcePersonId === personMergeTarget.person.id) return;

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const targetPersonId = personMergeTarget.person.id;

    mergePeopleLocally(targetPersonId, sourcePersonId);

    queuePendingChange({
      key: `merge:${targetPersonId}:${sourcePersonId}`,
      label: "People merge",
      runBeforePersonBatch: true,
      record: {
        kind: "people-merge",
        key: `merge:${targetPersonId}:${sourcePersonId}`,
        label: "People merge",
        organizationId: organizationId ?? null,
        targetPersonId,
        sourcePersonId,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId
          ? mergePeopleAction({ organizationId, targetPersonId, sourcePersonId })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });

    setPeopleMessage("People merge queued locally.");
    closeManualMerge();
  }

  function renameCompanyTag(summary: Extract<TagSummary, { type: "company" }>, nextName: string) {
    const cleanName = nextName.trim();
    if (!cleanName || cleanName === summary.name) return;
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;

    setCompanies((current) =>
      current.map((company) => ({
        ...company,
        tags: company.tags.map((tag) => (tag.id === summary.id ? { ...tag, name: cleanName } : tag)),
        people: company.tags.some((tag) => tag.id === summary.id) ? applyCategoryToPeople(company.people, cleanName, summary.name) : company.people,
      })),
    );

    queuePendingChange({
      key: `company-tag-rename:${summary.id}`,
      label: "Company tag rename",
      record: {
        kind: "company-tag-rename",
        key: `company-tag-rename:${summary.id}`,
        label: "Company tag rename",
        organizationId: organizationId ?? null,
        tagId: summary.id,
        name: cleanName,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(summary.id)
          ? renameCompanyTagAction({ organizationId, tagId: summary.id, name: cleanName })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    setTagDrafts((current) => ({ ...current, [summary.key]: cleanName }));
  }

  function renameContactTag(summary: Extract<TagSummary, { type: "contact" }>, nextName: string) {
    const cleanName = nextName.trim();
    if (!cleanName || cleanName === summary.name) return;
    const oldName = summary.name;
    const affectedPeople = peopleDirectory
      .map(({ person }) =>
        person.categories.some((category) => category === oldName)
          ? { ...person, categories: normalizePersonCategories(person.categories.map((category) => (category === oldName ? cleanName : category))) }
          : null,
      )
      .filter((person): person is Person => Boolean(person));

    if (affectedPeople.length === 0) return;

    affectedPeople.forEach((person) => {
      updatePersonLocally(personSourceIds(person), {
        displayName: person.displayName,
        emails: person.emails,
        categories: person.categories,
      });
      queuePersonUpdate(person, "Contact tag rename", { syncEmails: false });
    });
    setTagDrafts((current) => ({ ...current, [summary.key]: cleanName }));
  }

  function renameTag(summary: TagSummary) {
    const nextName = tagDrafts[summary.key] ?? summary.name;
    if (summary.type === "company") renameCompanyTag(summary as Extract<TagSummary, { type: "company" }>, nextName);
    else renameContactTag(summary as Extract<TagSummary, { type: "contact" }>, nextName);
  }

  return {
    peopleQuery,
    setPeopleQuery,
    peopleCompany,
    setPeopleCompany,
    peopleDomain,
    setPeopleDomain,
    peopleStage,
    setPeopleStage,
    peopleHighlight,
    setPeopleHighlight,
    peoplePageSize,
    setPeoplePageSize,
    peoplePage,
    setPeoplePage,
    personMergeTargetId,
    setPersonMergeTargetId,
    personMergeQuery,
    setPersonMergeQuery,
    peopleMessage,
    setPeopleMessage,
    incorrectEmails,
    setIncorrectEmails,
    incorrectEmailMessage,
    setIncorrectEmailMessage,
    isSplittingNames,
    splitNamesProgress,
    namesMessage,
    setNamesMessage,
    tagDrafts,
    setTagDrafts,

    deferredPeopleQuery,
    peopleRelationRows,
    peopleDirectory,
    filteredPeopleDirectory,
    visiblePeopleDirectory,
    personMergeTarget,
    personMergeCandidates,
    peopleCompanyNames,
    peopleEmailDomains,
    tagSummaries,
    peopleStart,
    peopleEnd,
    effectivePeoplePage,
    peopleTotalPages,

    updatePersonLocally,
    applyCategoryToPeople,
    toggleHighlight,
    importIncorrectEmailsCsv,
    handleIncorrectEmailCsvUpload,
    splitPeopleNames,
    startManualMerge,
    closeManualMerge,
    handleManualMerge,
    renameTag,
  };
}
