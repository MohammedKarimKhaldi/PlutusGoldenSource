import type { PendingChange, PendingPushContext } from "@/lib/crm-types";
import { isPendingPersonChange, mergePendingPersonUpdate } from "@/lib/crm-utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRemoteId(value: string | null | undefined) {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function isLocalPendingId(value: string | null | undefined) {
  return Boolean(value && !isRemoteId(value));
}

export function createPendingPushContext(resolutions = new Map<string, string>()): PendingPushContext {
  return {
    resolveId: (id) => {
      if (!id) return null;
      return resolutions.get(id) ?? id;
    },
    rememberId: (localId, remoteId) => {
      if (!localId || !remoteId || localId === remoteId) return;
      resolutions.set(localId, remoteId);
    },
  };
}

export function resolvePendingPayloadIds(
  payload: Record<string, unknown>,
  context: PendingPushContext,
  fields: string[],
) {
  const next = { ...payload };
  for (const field of fields) {
    const value = next[field];
    if (typeof value === "string") {
      next[field] = context.resolveId(value);
    }
  }
  return next;
}

export function upsertPendingChange(current: PendingChange[], change: PendingChange[]) {
  return change.reduce((next, item) => upsertOnePendingChange(next, item), current);
}

export function upsertOnePendingChange(current: PendingChange[], change: PendingChange) {
  const existingIndex = current.findIndex((item) => item.key === change.key);
  if (existingIndex === -1) return [...current, change];

  const next = [...current];
  const existingChange = current[existingIndex];
  if (isPendingPersonChange(existingChange) && isPendingPersonChange(change)) {
    const mergedPersonUpdate = mergePendingPersonUpdate(existingChange.personUpdate, change.personUpdate);
    next[existingIndex] = {
      ...change,
      personUpdate: mergedPersonUpdate,
      record: {
        kind: "person",
        key: change.key,
        label: change.label,
        personUpdate: mergedPersonUpdate,
      },
    };
  } else {
    next[existingIndex] = change;
  }
  return next;
}
