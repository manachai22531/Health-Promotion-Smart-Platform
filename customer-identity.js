'use strict';

const normalizeText = value => String(value == null ? '' : value)
  .replace(/^\uFEFF|[\u200B-\u200D\u2060]/g, '')
  .trim();

const normalizeIdentity = value => normalizeText(value)
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const normalizeLoose = value => normalizeText(value)
  .toLowerCase()
  .replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');

function identityParts(record = {}) {
  const strong = normalizeIdentity(record.id || record.idPassport || record.identificationNumber || record.passportNumber);
  const hn = normalizeLoose(record.hn);
  const employee = normalizeLoose(record.employeeCode);
  const birth = normalizeLoose(record.birth || record.birthDate);
  const first = normalizeLoose(record.first || record.firstName);
  const last = normalizeLoose(record.last || record.lastName);
  const nameDob = first && last && birth ? `${first}|${last}|${birth}` : '';
  return { strong, hn, employee, nameDob };
}

function mergeRecordPreservingOperational(matched, item, companyId) {
  const operational = /^(his|healthBook|openVisit|orderHis|visit|checkin|station|audit|log)/i;
  const row = { ...matched, ...item, key: matched.key || matched.id, companyId: matched.companyId || String(companyId) };
  Object.keys(matched).forEach(key => {
    if (operational.test(key) && matched[key] != null) row[key] = matched[key];
  });
  ['visitedAt', 'cashAccepted', 'acceptedBillingItems', 'acceptedCashItems', 'selectedPackages', 'createdAt'].forEach(key => {
    if (matched[key] != null) row[key] = matched[key];
  });
  if (!String(item.hn || '').trim() && matched.hn) row.hn = matched.hn;
  if (!String(item.vn || item.hisLastVisitUID || '').trim()) {
    row.vn = matched.vn || '';
    row.hisLastVisitUID = matched.hisLastVisitUID || matched.vn || '';
  } else {
    row.vn = String(item.vn || item.hisLastVisitUID || '').trim();
    row.hisLastVisitUID = String(item.hisLastVisitUID || item.vn || '').trim();
  }
  return row;
}

function mergeCustomerImport(existing = [], incoming = [], companyId = '') {
  const strongIndex = new Map();
  const hnIndex = new Map();
  const employeeIndex = new Map();
  const nameDobIndex = new Map();
  const wrappers = [];
  const existingWrappers = existing.map(record => ({ record, origin: 'existing', emitted: false }));

  const addToIndexes = wrapper => {
    const parts = identityParts(wrapper.record);
    if (parts.strong && !strongIndex.has(parts.strong)) strongIndex.set(parts.strong, wrapper);
    if (parts.hn && !hnIndex.has(parts.hn)) hnIndex.set(parts.hn, wrapper);
    if (parts.employee && !employeeIndex.has(parts.employee)) employeeIndex.set(parts.employee, wrapper);
    if (parts.nameDob) {
      const set = nameDobIndex.get(parts.nameDob) || new Set();
      set.add(wrapper);
      nameDobIndex.set(parts.nameDob, set);
    }
  };
  existingWrappers.forEach(addToIndexes);

  const usedExisting = new Set();
  const conflicts = [];
  let duplicateIncoming = 0;

  for (let rowIndex = 0; rowIndex < incoming.length; rowIndex += 1) {
    const item = { ...incoming[rowIndex], companyId: String(companyId) };
    const parts = identityParts(item);
    let matched = null;

    if (parts.strong) {
      matched = strongIndex.get(parts.strong) || null;
      if (!matched) {
        for (const [kind, key, map] of [
          ['HN', parts.hn, hnIndex],
          ['EMPLOYEE_CODE', parts.employee, employeeIndex]
        ]) {
          if (!key) continue;
          const candidate = map.get(key);
          if (!candidate) continue;
          const candidateStrong = identityParts(candidate.record).strong;
          if (candidateStrong && candidateStrong !== parts.strong) {
            conflicts.push({ row: rowIndex + 1, type: 'STRONG_ID_MISMATCH', matchedBy: kind, incomingIdentity: parts.strong, existingIdentity: candidateStrong });
            matched = null;
            break;
          }
          matched = candidate;
          break;
        }
      }
    } else {
      if (parts.hn) matched = hnIndex.get(parts.hn) || null;
      if (!matched && parts.employee) matched = employeeIndex.get(parts.employee) || null;
    }

    // Name + DOB is intentionally review-only. It is not safe enough for automatic person merging.
    if (!matched && parts.nameDob) {
      const candidates = nameDobIndex.get(parts.nameDob);
      if (candidates && candidates.size) {
        conflicts.push({ row: rowIndex + 1, type: 'NAME_DOB_REVIEW_REQUIRED', candidates: candidates.size });
      }
    }

    if (matched) {
      if (matched.origin === 'existing') {
        usedExisting.add(matched);
        if (!matched.emitted) {
          matched.record = mergeRecordPreservingOperational(matched.record, item, companyId);
          matched.emitted = true;
          wrappers.push(matched);
        } else {
          matched.record = mergeRecordPreservingOperational(matched.record, item, companyId);
          duplicateIncoming += 1;
        }
      } else {
        matched.record = mergeRecordPreservingOperational(matched.record, item, companyId);
        duplicateIncoming += 1;
      }
      addToIndexes(matched);
    } else {
      const wrapper = { record: item, origin: 'new', emitted: true };
      wrappers.push(wrapper);
      addToIndexes(wrapper);
    }
  }

  const untouched = existingWrappers.filter(wrapper => !usedExisting.has(wrapper)).map(wrapper => wrapper.record);
  const changedRecords = wrappers.map(wrapper => wrapper.record);
  const updated = wrappers.filter(wrapper => wrapper.origin === 'existing').length;
  const added = wrappers.filter(wrapper => wrapper.origin === 'new').length;
  return {
    companyRecords: untouched.concat(changedRecords),
    changedRecords,
    updated,
    added,
    kept: untouched.length,
    duplicateIncoming,
    conflicts
  };
}

module.exports = { normalizeIdentity, identityParts, mergeCustomerImport };
