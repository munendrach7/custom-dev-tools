import React, { useEffect, useState, useCallback } from 'react';
import { Button, Input, Select, Textarea, TabList, Tab, Field, Spinner } from '@fluentui/react-components';
import { Send16Regular } from '@fluentui/react-icons';
import { clientApi, setToken, METHODS } from './clientApi';
import { useDialogs } from './useDialogs';
import KeyValueEditor from './KeyValueEditor';
import AuthEditor from './AuthEditor';
import ResponseViewer from './ResponseViewer';
import EnvironmentsModal from './EnvironmentsModal';

const ENV_KEY = 'devtools.activeEnv';

function blankDraft(collectionId) {
  return {
    id: null,
    collection_id: collectionId ?? null,
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    body_type: 'none',
    body: '',
    auth: { type: 'none' },
    sort_order: 0,
  };
}

const methodClass = (m) => `mtag m-${m.toLowerCase()}`;

export default function ApiClientApp({ user, onBack, onLogout }) {
  const [collections, setCollections] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [activeEnvId, setActiveEnvId] = useState(() => {
    const v = localStorage.getItem(ENV_KEY);
    return v ? Number(v) : null;
  });
  const [draft, setDraft] = useState(() => blankDraft(null));
  const [reqTab, setReqTab] = useState('params');
  const [response, setResponse] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [envModal, setEnvModal] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expanded, setExpanded] = useState({}); // collectionId -> bool
  const { askPrompt, askConfirm, dialogNode } = useDialogs();

  const reloadCollections = useCallback(async () => {
    const cols = await clientApi.listCollections();
    setCollections(cols);
    return cols;
  }, []);
  const reloadEnvironments = useCallback(async () => {
    const envs = await clientApi.listEnvironments();
    setEnvironments(envs);
    return envs;
  }, []);

  useEffect(() => {
    reloadCollections().catch((e) => setError(e.message));
    reloadEnvironments().catch((e) => setError(e.message));
  }, [reloadCollections, reloadEnvironments]);

  const activeEnv = environments.find((e) => e.id === activeEnvId) || null;

  // Effective variables for {{var}} interpolation: collection-scoped variables
  // (for the current request's collection) apply automatically, and the globally
  // selected environment overrides them. This means variables work without having
  // to manually pick an environment for collection-scoped values.
  const effectiveVariables = useCallback(() => {
    const map = new Map();
    if (draft.collection_id) {
      environments
        .filter((e) => e.collection_id === draft.collection_id)
        .forEach((e) => (e.variables || []).forEach((v) => v && v.key && map.set(v.key, v)));
    }
    if (activeEnv) (activeEnv.variables || []).forEach((v) => v && v.key && map.set(v.key, v));
    return Array.from(map.values());
  }, [environments, draft.collection_id, activeEnv]);

  const setField = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  // ---- collections / requests ----
  const addCollection = async () => {
    const name = await askPrompt({ title: 'New collection', label: 'Collection name', defaultValue: 'New Collection', okText: 'Create' });
    if (!name) return;
    try {
      const col = await clientApi.createCollection(name);
      await reloadCollections();
      setExpanded((e) => ({ ...e, [col.id]: true }));
    } catch (e) { setError(e.message); }
  };

  const removeCollection = async (col) => {
    if (!(await askConfirm({ title: 'Delete collection', message: `Delete "${col.name}" and all its requests?`, okText: 'Delete', danger: true }))) return;
    try {
      await clientApi.deleteCollection(col.id);
      await reloadCollections();
      if (draft.collection_id === col.id) setDraft(blankDraft(null));
    } catch (e) { setError(e.message); }
  };

  const addRequest = async (col) => {
    try {
      const req = await clientApi.createRequest(col.id, blankDraft(col.id));
      await reloadCollections();
      setExpanded((e) => ({ ...e, [col.id]: true }));
      selectRequest(req);
    } catch (e) { setError(e.message); }
  };

  const selectRequest = (req) => {
    setDraft({
      id: req.id,
      collection_id: req.collection_id,
      name: req.name,
      method: req.method,
      url: req.url,
      headers: req.headers || [],
      params: req.params || [],
      body_type: req.body_type || 'none',
      body: req.body || '',
      auth: req.auth && Object.keys(req.auth).length ? req.auth : { type: 'none' },
      sort_order: req.sort_order || 0,
    });
    setResponse(null);
    setError(null);
    setDirty(false);
  };

  const saveRequest = async () => {
    try {
      const payload = {
        name: draft.name, method: draft.method, url: draft.url,
        headers: draft.headers, params: draft.params,
        body_type: draft.body_type, body: draft.body, auth: draft.auth,
      };
      if (draft.id) {
        await clientApi.updateRequest(draft.id, payload);
      } else {
        // Need a collection to save into.
        let colId = draft.collection_id;
        if (!colId) {
          if (!collections.length) { await addCollection(); }
          const cols = await reloadCollections();
          colId = collections[0]?.id || cols[0]?.id;
          if (!colId) return;
        }
        const created = await clientApi.createRequest(colId, payload);
        setDraft((d) => ({ ...d, id: created.id, collection_id: created.collection_id }));
      }
      await reloadCollections();
      setDirty(false);
    } catch (e) { setError(e.message); }
  };

  const removeRequest = async (req) => {
    if (!(await askConfirm({ title: 'Delete request', message: `Delete request "${req.name}"?`, okText: 'Delete', danger: true }))) return;
    try {
      await clientApi.deleteRequest(req.id);
      await reloadCollections();
      if (draft.id === req.id) setDraft(blankDraft(null));
    } catch (e) { setError(e.message); }
  };

  // ---- send ----
  const sendRequest = async () => {
    if (!draft.url.trim()) { setError('Enter a URL first.'); return; }
    setSending(true);
    setError(null);
    setResponse(null);
    try {
      const payload = {
        method: draft.method,
        url: draft.url,
        headers: draft.headers,
        params: draft.params,
        body_type: draft.body_type,
        body: draft.body,
        auth: draft.auth,
        variables: effectiveVariables(),
      };
      const res = await clientApi.send(payload);
      setResponse(res);
      loadHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const loadHistory = useCallback(async () => {
    try { setHistory(await clientApi.history(50)); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const selectEnv = (id) => {
    setActiveEnvId(id);
    if (id) localStorage.setItem(ENV_KEY, String(id));
    else localStorage.removeItem(ENV_KEY);
  };

  const logout = () => {
    setToken('');
    onLogout();
  };

  const beautifyBody = () => {
    try {
      const pretty = JSON.stringify(JSON.parse(draft.body), null, 2);
      setField({ body: pretty });
    } catch { setError('Body is not valid JSON.'); }
  };

  return (
    <div className="app">
      <div className="topbar">
        <Button appearance="subtle" className="back-btn" onClick={onBack} title="Back to tools menu">← Tools</Button>
        <div className="brand"><span className="logo">⇅</span> API Client</div>
        <span className="grow" />
        <div className="env-select">
          <span className="muted" style={{ fontSize: 12 }}>Env:</span>
          <Select
            className="select"
            value={activeEnvId ?? ''}
            onChange={(e) => selectEnv(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No environment</option>
            {environments.map((en) => (
              <option key={en.id} value={en.id}>{en.name}</option>
            ))}
          </Select>
          <Button size="small" appearance="secondary" onClick={() => setEnvModal(true)}>Manage</Button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>👤 {user?.username}</span>
        <Button size="small" appearance="secondary" onClick={logout}>Logout</Button>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}

      <div className="body">
        {/* Sidebar: collections & requests */}
        <div className="sidebar">
          <div className="side-head">
            <h3 style={{ margin: 0 }}>Collections</h3>
            <Button size="small" appearance="secondary" onClick={addCollection}>+ New</Button>
          </div>

          {collections.length === 0 && <div className="muted" style={{ padding: '8px 6px', fontSize: 12 }}>No collections yet. Create one to save requests.</div>}

          {collections.map((col) => (
            <div key={col.id} className="col-block">
              <div className="col-head">
                <span className="col-toggle" onClick={() => setExpanded((e) => ({ ...e, [col.id]: !e[col.id] }))}>
                  {expanded[col.id] ? '▾' : '▸'}
                </span>
                <span className="col-name" title={col.description} onClick={() => setExpanded((e) => ({ ...e, [col.id]: !e[col.id] }))}>
                  {col.name}
                </span>
                <span className="muted col-count">{col.requests.length}</span>
                <button className="icon-btn tiny" title="Add request" onClick={() => addRequest(col)}>+</button>
                <button className="icon-btn tiny" title="Delete collection" onClick={() => removeCollection(col)}>×</button>
              </div>
              {expanded[col.id] && col.requests.map((req) => (
                <div
                  key={req.id}
                  className={`req-item ${draft.id === req.id ? 'active' : ''}`}
                  onClick={() => selectRequest(req)}
                >
                  <span className={methodClass(req.method)}>{req.method}</span>
                  <span className="req-name">{req.name}</span>
                  <button className="icon-btn tiny" title="Delete" onClick={(e) => { e.stopPropagation(); removeRequest(req); }}>×</button>
                </div>
              ))}
            </div>
          ))}

          <div className="side-head" style={{ marginTop: 14 }}>
            <h3 style={{ margin: 0 }}>History</h3>
            <Button size="small" appearance="secondary" onClick={() => setShowHistory((s) => !s)}>{showHistory ? 'Hide' : 'Show'}</Button>
          </div>
          {showHistory && (
            <div className="history-list">
              {history.length === 0 && <div className="muted" style={{ padding: '4px 6px', fontSize: 12 }}>No history yet.</div>}
              {history.map((h) => (
                <div key={h.id} className="hist-item" title={h.url} onClick={() => setField({ method: h.method, url: h.url })}>
                  <span className={methodClass(h.method)}>{h.method}</span>
                  <span className="hist-url">{h.url}</span>
                  <span className="muted hist-status">{h.status || 'ERR'}</span>
                </div>
              ))}
              {history.length > 0 && (
                <Button size="small" appearance="secondary" style={{ margin: 6 }} onClick={async () => { await clientApi.clearHistory(); loadHistory(); }}>Clear history</Button>
              )}
            </div>
          )}
        </div>

        {/* Main: request builder + response */}
        <div className="main">
          <div className="req-namebar">
            <Input
              className="req-title-input"
              appearance="underline"
              value={draft.name}
              onChange={(_, d) => setField({ name: d.value })}
              spellCheck={false}
            />
            <Button size="small" appearance="secondary" onClick={saveRequest} disabled={!dirty && !!draft.id}>
              {draft.id ? (dirty ? 'Save*' : 'Saved') : 'Save'}
            </Button>
          </div>

          <div className="url-bar">
            <Select className="method-select" value={draft.method} onChange={(e) => setField({ method: e.target.value })}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Input
              className="url-input"
              input={{ className: 'mono' }}
              placeholder="https://api.example.com/path  or  {{base}}/path"
              value={draft.url}
              onChange={(_, d) => setField({ url: d.value })}
              onKeyDown={(e) => e.key === 'Enter' && sendRequest()}
              spellCheck={false}
            />
            <Button
              appearance="primary"
              className="send-btn"
              onClick={sendRequest}
              disabled={sending}
              icon={sending ? <Spinner size="tiny" /> : <Send16Regular />}
            >
              Send
            </Button>
          </div>

          <TabList className="req-tabs" selectedValue={reqTab} onTabSelect={(_, d) => setReqTab(d.value)}>
            {['params', 'headers', 'body', 'auth'].map((t) => {
              const count =
                t === 'params' ? draft.params.filter((p) => p.key).length
                  : t === 'headers' ? draft.headers.filter((h) => h.key).length
                    : 0;
              return (
                <Tab key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}{count ? ` (${count})` : ''}
                </Tab>
              );
            })}
          </TabList>

          <div className="req-panel">
            {reqTab === 'params' && (
              <KeyValueEditor rows={draft.params} onChange={(params) => setField({ params })} keyPlaceholder="param" />
            )}
            {reqTab === 'headers' && (
              <KeyValueEditor rows={draft.headers} onChange={(headers) => setField({ headers })} keyPlaceholder="header" />
            )}
            {reqTab === 'body' && (
              <div className="body-editor">
                <div className="field-row" style={{ marginBottom: 8 }}>
                  <label>Body type</label>
                  <Select className="select" value={draft.body_type} onChange={(e) => setField({ body_type: e.target.value })}>
                    <option value="none">None</option>
                    <option value="json">JSON</option>
                    <option value="text">Raw text</option>
                  </Select>
                  {draft.body_type === 'json' && <Button size="small" appearance="secondary" onClick={beautifyBody}>Beautify</Button>}
                </div>
                {draft.body_type !== 'none' && (
                  <Textarea
                    className="body-area"
                    textarea={{ className: 'mono' }}
                    placeholder={draft.body_type === 'json' ? '{\n  "key": "value"\n}' : 'raw body…'}
                    value={draft.body}
                    onChange={(_, d) => setField({ body: d.value })}
                    spellCheck={false}
                  />
                )}
                {draft.body_type === 'none' && <div className="muted" style={{ padding: 4 }}>This request has no body.</div>}
              </div>
            )}
            {reqTab === 'auth' && (
              <AuthEditor auth={draft.auth} onChange={(auth) => setField({ auth })} />
            )}
          </div>

          <div className="resp-wrap">
            <ResponseViewer response={response} loading={sending} />
          </div>
        </div>
      </div>

      {envModal && (
        <EnvironmentsModal
          environments={environments}
          collections={collections}
          onClose={() => setEnvModal(false)}
          onChanged={reloadEnvironments}
        />
      )}
      {dialogNode}
    </div>
  );
}
