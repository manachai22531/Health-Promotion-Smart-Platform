import type { JsonValue } from '../types/domain';

type UnknownRecord = Record<string, unknown>;

export interface HisVisitRecord extends UnknownRecord {
  VisitUID?: unknown;
  VisitDate?: unknown;
  Item?: unknown[];
  Package?: unknown[];
}

export interface HisPatientWithVisits extends UnknownRecord {
  Visit?: HisVisitRecord[];
}

const isObject = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object';

const hasHisPayloadMarker = (value: unknown): value is UnknownRecord =>
  isObject(value) && Boolean(
    value.Patient || value.LineItem || value.Visit ||
    value.LineItemUnstructure || value.LineItemICD,
  );

const hasEmrMarker = (value: unknown): value is UnknownRecord =>
  isObject(value) && Boolean(
    value.Patient || Array.isArray(value.LineItem) ||
    Array.isArray(value.lineItem) || Array.isArray(value.LineItems) ||
    value.LineItemUnstructure || value.LineItemICD,
  );

/** Preserves the legacy unwrapping rules used by every configured HIS call. */
export function normalizeHisApiPayload(data: unknown, depth = 0): unknown {
  if (depth > 6 || data == null) return data;
  if (typeof data === 'string') {
    const value = data.trim();
    if (!value) return data;
    try {
      return normalizeHisApiPayload(JSON.parse(value) as JsonValue, depth + 1);
    } catch {
      return data;
    }
  }
  if (Array.isArray(data)) {
    if (data.length === 1 && (isObject(data[0]) || typeof data[0] === 'string')) {
      const nested = normalizeHisApiPayload(data[0], depth + 1);
      if (hasHisPayloadMarker(nested)) return nested;
    }
    return data;
  }
  if (isObject(data)) {
    if (hasHisPayloadMarker(data)) return data;
    for (const key of ['body', 'data', 'result', 'response', 'payload']) {
      if (data[key] != null) {
        const nested = normalizeHisApiPayload(data[key], depth + 1);
        if (nested !== data[key] || hasHisPayloadMarker(nested)) return nested;
      }
    }
  }
  return data;
}

export function findHisEmrPayload(
  input: unknown,
  depth = 0,
  seen = new Set<object>(),
): unknown {
  const data = normalizeHisApiPayload(input);
  if (depth > 12 || data === null || typeof data !== 'object') return data;
  if (seen.has(data)) return data;
  seen.add(data);
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findHisEmrPayload(item, depth + 1, seen);
      if (hasEmrMarker(found)) return found;
    }
    return data;
  }
  if (hasEmrMarker(data)) return data;
  for (const value of Object.values(data)) {
    const found = findHisEmrPayload(value, depth + 1, seen);
    if (hasEmrMarker(found)) return found;
  }
  return data;
}

const visitTimestamp = (value: unknown): number => {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

/** Selects an explicit VisitUID first, then the richest and newest visit. */
export function chooseHisVisit(
  patient: HisPatientWithVisits | null | undefined,
  requestedVisitUID = '',
): HisVisitRecord | null {
  const visits = Array.isArray(patient?.Visit) ? patient.Visit : [];
  if (requestedVisitUID) {
    const exact = visits.find(
      visit => String(visit?.VisitUID || '') === String(requestedVisitUID),
    );
    if (exact) return exact;
  }
  return [...visits].sort((left, right) => {
    const leftHasData = (Array.isArray(left?.Item) && left.Item.length) ||
      (Array.isArray(left?.Package) && left.Package.length) ? 1 : 0;
    const rightHasData = (Array.isArray(right?.Item) && right.Item.length) ||
      (Array.isArray(right?.Package) && right.Package.length) ? 1 : 0;
    return rightHasData - leftHasData ||
      visitTimestamp(right?.VisitDate) - visitTimestamp(left?.VisitDate);
  })[0] || null;
}
