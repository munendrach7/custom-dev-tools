const BASE = '';

async function post(url, body) {
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  open: (path) => post('/api/open', { path }),
  columns: (path, sample) => post('/api/columns', { path, sample }),
  records: (path, start, limit) => post('/api/records', { path, start, limit }),
  count: (path, column, scope, topN) =>
    post('/api/count', { path, column, scope, topN }),
  search: (path, query, limit) => post('/api/search', { path, query, limit }),
  readFile: (path) => post('/api/readfile', { path }),
};

export function formatBytes(n) {
  if (n == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatNum(n) {
  if (n == null) return '';
  return n.toLocaleString();
}
