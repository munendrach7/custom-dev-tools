// API Client backend helpers. All outbound HTTP is proxied by the Python
// backend (/client/*), so the browser never triggers CORS on target APIs.

const TOKEN_KEY = 'devtools.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.detail || data.error || `Request failed (${res.status})`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    throw err;
  }
  return data;
}

export const clientApi = {
  // auth
  register: (username, password, email) =>
    request('/client/auth/register', { method: 'POST', auth: false, body: { username, password, email } }),
  login: (username, password) =>
    request('/client/auth/login', { method: 'POST', auth: false, body: { username, password } }),
  me: () => request('/client/auth/me'),

  // collections
  listCollections: () => request('/client/collections'),
  createCollection: (name, description = '') =>
    request('/client/collections', { method: 'POST', body: { name, description } }),
  updateCollection: (id, patch) =>
    request(`/client/collections/${id}`, { method: 'PATCH', body: patch }),
  deleteCollection: (id) =>
    request(`/client/collections/${id}`, { method: 'DELETE' }),

  // requests
  createRequest: (collectionId, req) =>
    request(`/client/collections/${collectionId}/requests`, { method: 'POST', body: req }),
  updateRequest: (id, patch) =>
    request(`/client/requests/${id}`, { method: 'PATCH', body: patch }),
  deleteRequest: (id) =>
    request(`/client/requests/${id}`, { method: 'DELETE' }),

  // environments
  listEnvironments: () => request('/client/environments'),
  createEnvironment: (env) =>
    request('/client/environments', { method: 'POST', body: env }),
  updateEnvironment: (id, patch) =>
    request(`/client/environments/${id}`, { method: 'PATCH', body: patch }),
  deleteEnvironment: (id) =>
    request(`/client/environments/${id}`, { method: 'DELETE' }),

  // send + history
  send: (payload) => request('/client/send', { method: 'POST', body: payload }),
  history: (limit = 50) => request(`/client/history?limit=${limit}`),
  clearHistory: () => request('/client/history', { method: 'DELETE' }),
};

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
