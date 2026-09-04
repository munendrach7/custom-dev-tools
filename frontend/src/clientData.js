// Client-side helpers used when the user pastes JSON/JSONL directly
// (no server file to index), mirroring the server's logic.

export function parseJsonlText(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  let index = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let rec;
    try {
      const parsed = JSON.parse(line);
      rec = { __index: index, ...parsed };
    } catch (e) {
      rec = { __index: index, __error: e.message, __raw: line };
    }
    records.push(rec);
    index++;
  }
  return records;
}

// Filter in-memory records whose JSON contains the query (case-insensitive
// substring match). Re-indexes results so positions stay contiguous.
export function filterRecords(records, query, caseSensitive = false) {
  const q = caseSensitive ? query : query.toLowerCase();
  const out = [];
  for (const rec of records) {
    const { __index, ...rest } = rec || {};
    let hay = JSON.stringify(rest);
    if (!caseSensitive) hay = hay.toLowerCase();
    if (hay.indexOf(q) !== -1) {
      out.push({ ...rec, __index: out.length });
    }
  }
  return out;
}

export function inferColumns(records, sample = 1000) {
  const metaKeys = new Set();
  const recordKeys = new Set();
  const recordNested = {};
  const limit = Math.min(records.length, sample);
  for (let i = 0; i < limit; i++) {
    const obj = records[i];
    if (!obj || obj.__error) continue;
    for (const k of Object.keys(obj)) {
      if (k === '_record' || k === '__index') continue;
      metaKeys.add(k);
    }
    const rec = obj._record;
    if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
      for (const k of Object.keys(rec)) {
        recordKeys.add(k);
        const v = rec[k];
        if (v !== null && typeof v === 'object') recordNested[k] = true;
      }
    }
  }
  return {
    sampled: limit,
    metaColumns: [...metaKeys],
    recordColumns: [...recordKeys].map((k) => ({ key: k, nested: !!recordNested[k] })),
  };
}

// Mirrors the server /api/count result shape, computed in memory.
export function countColumn(records, column, scope, topN = 100) {
  const MAX_DISTINCT = 20000;
  const valueCounts = new Map();
  let total = 0;
  let nonNull = 0;
  let nullOrMissing = 0;
  let distinctCapped = false;

  for (const obj of records) {
    if (!obj || obj.__error) continue;
    total++;
    const container = scope === 'record' ? obj._record || {} : obj;
    const v = container ? container[column] : undefined;
    if (v === undefined || v === null || v === '') {
      nullOrMissing++;
      continue;
    }
    nonNull++;
    const key = typeof v === 'object' ? '[object]' : String(v);
    if (valueCounts.has(key)) {
      valueCounts.set(key, valueCounts.get(key) + 1);
    } else if (valueCounts.size < MAX_DISTINCT) {
      valueCounts.set(key, 1);
    } else {
      distinctCapped = true;
    }
  }

  const topValues = [...valueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([value, count]) => ({ value, count }));

  return {
    column,
    scope,
    total,
    nonNull,
    nullOrMissing,
    distinctCount: valueCounts.size,
    distinctCapped,
    topValues,
  };
}
