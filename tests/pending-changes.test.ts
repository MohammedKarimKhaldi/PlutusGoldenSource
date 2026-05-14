import { describe, expect, it } from "vitest";

import type { PendingChange } from "../src/lib/crm-types";
import {
  createPendingPushContext,
  isLocalPendingId,
  resolvePendingPayloadIds,
  upsertOnePendingChange,
} from "../src/lib/pending-changes";

const noopRun: PendingChange["run"] = () => Promise.resolve({ ok: true, message: "ok" });

function pendingChange(change: Pick<PendingChange, "key" | "label" | "record">): PendingChange {
  return {
    ...change,
    run: noopRun,
  };
}

describe("pending change batching", () => {
  it("coalesces repeated entity changes by replacing the queued record", () => {
    const first = pendingChange({
      key: "accounting-document:doc-1",
      label: "Create invoice",
      record: {
        kind: "accounting-document-save",
        key: "accounting-document:doc-1",
        label: "Create invoice",
        localId: "doc-1",
        payload: { title: "First" },
      },
    });
    const second = pendingChange({
      key: "accounting-document:doc-1",
      label: "Update invoice",
      record: {
        kind: "accounting-document-save",
        key: "accounting-document:doc-1",
        label: "Update invoice",
        localId: "doc-1",
        payload: { title: "Second" },
      },
    });

    const queued = upsertOnePendingChange(upsertOnePendingChange([], first), second);

    expect(queued).toHaveLength(1);
    expect(queued[0].record).toMatchObject({ kind: "accounting-document-save", payload: { title: "Second" } });
  });

  it("lets delete and void actions supersede queued saves for the same record", () => {
    const save = pendingChange({
      key: "fundraising-client:client-1",
      label: "Create client",
      record: {
        kind: "fundraising-client-save",
        key: "fundraising-client:client-1",
        label: "Create client",
        localId: "client-1",
        payload: { mandateName: "Series A" },
      },
    });
    const remove = pendingChange({
      key: "fundraising-client:client-1",
      label: "Delete client",
      record: {
        kind: "fundraising-delete",
        key: "fundraising-client:client-1",
        label: "Delete client",
        entityType: "client",
        id: "client-1",
      },
    });

    const queued = upsertOnePendingChange(upsertOnePendingChange([], save), remove);

    expect(queued).toHaveLength(1);
    expect(queued[0].record.kind).toBe("fundraising-delete");
  });

  it("resolves local ids before dependent records are pushed", () => {
    const resolutions = new Map<string, string>();
    const context = createPendingPushContext(resolutions);
    context.rememberId("local-accounting-document-1", "33333333-3333-4333-8333-333333333333");

    const payload = resolvePendingPayloadIds(
      {
        documentId: "local-accounting-document-1",
        companyId: "22222222-2222-4222-8222-222222222222",
      },
      context,
      ["documentId", "companyId"],
    );

    expect(payload.documentId).toBe("33333333-3333-4333-8333-333333333333");
    expect(payload.companyId).toBe("22222222-2222-4222-8222-222222222222");
    expect(isLocalPendingId("local-accounting-document-1")).toBe(true);
    expect(isLocalPendingId("33333333-3333-4333-8333-333333333333")).toBe(false);
  });
});
