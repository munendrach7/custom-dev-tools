import React, { useCallback, useMemo, useState, useRef } from 'react';
import { Button, Input, Textarea, TabList, Tab, Spinner } from '@fluentui/react-components';
import { DocumentArrowUp16Regular, FolderArrowUp16Regular } from '@fluentui/react-icons';
import { api, formatBytes, formatNum } from './api';
import { parseJsonlText, inferColumns, countColumn } from './clientData';
import VirtualTable from './VirtualTable';
import Modal from './Modal';
import JsonTree from './JsonTree';
import CountPanel from './CountPanel';

export default function JsonlApp({ onBack }) {
  const [mode, setMode] = useState('jsonl'); // 'jsonl' | 'json'
  const [pathInput, setPathInput] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [files, setFiles] = useState([]); // server-loaded jsonl files
  const [activePath, setActivePath] = useState(null);
  const [view, setView] = useState(null); // { kind, ... }

  const [jsonModal, setJsonModal] = useState(null); // { data, title }
  const [countModal, setCountModal] = useState(null); // { column, runCount }

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const resetOutputs = () => {
    setFiles([]);
    setActivePath(null);
    setView(null);
    setError(null);
  };

  // Build a table view backed by a server-indexed file.
  const openServerFile = useCallback(async (file) => {
    setActivePath(file.path);
    setView(null);
    setError(null);
    try {
      const columns = await api.columns(file.path, 500);
      setView({
        kind: 'table',
        sourceId: file.path,
        total: file.lineCount,
        columns,
        meta: { name: file.name, path: file.path, size: file.size },
        fetchPage: (start, limit) => api.records(file.path, start, limit),
        makeCounter: (column, scope) => () => api.count(file.path, column, scope, 100),
      });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Build a table view from an in-memory record array (pasted JSONL).
  const openLocalRecords = useCallback((records, meta) => {
    const columns = inferColumns(records);
    setView({
      kind: 'table',
      sourceId: meta.sourceId,
      total: records.length,
      columns,
      meta,
      fetchPage: (start, limit) => ({
        records: records.slice(start, start + limit),
        total: records.length,
      }),
      makeCounter: (column, scope) => () => countColumn(records, column, scope, 100),
    });
  }, []);

  // --- Actions ---

  const loadFromPath = useCallback(async () => {
    const p = pathInput.trim();
    if (!p) return;
    setLoading(true);
    resetOutputs();
    try {
      if (mode === 'jsonl') {
        const { files } = await api.open(p);
        setFiles(files);
        if (files.length) await openServerFile(files[0]);
      } else {
        const { text, name, size } = await api.readFile(p);
        const data = JSON.parse(text);
        setView({ kind: 'json', data, title: name || p, meta: { name, size } });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pathInput, mode, openServerFile]);

  const loadFromPaste = useCallback(() => {
    const text = pasteText.trim();
    if (!text) return;
    setLoading(true);
    resetOutputs();
    try {
      if (mode === 'jsonl') {
        const records = parseJsonlText(text);
        if (!records.length) throw new Error('No JSONL records found in pasted text.');
        openLocalRecords(records, {
          name: 'pasted.jsonl',
          sourceId: 'paste-jsonl-' + Date.now(),
          size: new Blob([text]).size,
          pasted: true,
        });
      } else {
        const data = JSON.parse(text);
        setView({ kind: 'json', data, title: 'Pasted JSON', meta: { pasted: true } });
      }
    } catch (err) {
      setError('Could not parse pasted ' + mode.toUpperCase() + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [pasteText, mode, openLocalRecords]);

  // Read files chosen via the Browse buttons entirely in the browser (works in
  // the dockerized app where the server can't see the host filesystem).
  const handleBrowse = useCallback(async (fileList) => {
    const all = Array.from(fileList || []);
    const arr = all.filter((f) => /\.(jsonl?|ndjson|txt)$/i.test(f.name));
    const files = arr.length ? arr : all;
    if (!files.length) return;
    setLoading(true);
    resetOutputs();
    try {
      if (mode === 'jsonl') {
        let records = [];
        for (const f of files) {
          const text = await f.text();
          if (/\.json$/i.test(f.name)) {
            const data = JSON.parse(text);
            records = records.concat(Array.isArray(data) ? data : [data]);
          } else {
            records = records.concat(parseJsonlText(text));
          }
        }
        if (!records.length) throw new Error('No records found in the selected file(s).');
        openLocalRecords(records, {
          name: files.length === 1 ? files[0].name : `${files.length} files`,
          sourceId: 'browse-' + Date.now(),
          size: files.reduce((a, f) => a + f.size, 0),
          pasted: true,
        });
      } else {
        const f = files[0];
        const text = await f.text();
        const data = JSON.parse(text);
        setView({ kind: 'json', data, title: f.name, meta: { name: f.name, size: f.size, pasted: true } });
      }
    } catch (err) {
      setError('Could not read selected file(s): ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, openLocalRecords]);

  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    resetOutputs();
  };

  const totalRecords = useMemo(
    () => files.reduce((a, f) => a + f.lineCount, 0),
    [files]
  );

  return (
    <div className="app">
      <div className="topbar">
        {onBack && (
          <Button appearance="subtle" className="back-btn" onClick={onBack} title="Back to tools menu">
            ← Tools
          </Button>
        )}
        <div className="brand">
          <span className="logo">⬢</span> JSON / JSONL Viewer
        </div>
        <span className="grow" />
        <span className="muted" style={{ fontSize: 12 }}>
          Load a local path or paste content — supports JSON &amp; JSONL
        </span>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}

      <div className="body">
        <div className="sidebar">
          <TabList
            className="mode-toggle"
            selectedValue={mode}
            onTabSelect={(_, d) => switchMode(d.value)}
          >
            <Tab value="json">JSON</Tab>
            <Tab value="jsonl">JSONL</Tab>
          </TabList>

          <h3>Browse local files</h3>
          <div className="browse-group">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.jsonl,.ndjson,.txt"
              multiple={mode === 'jsonl'}
              style={{ display: 'none' }}
              onChange={(e) => { handleBrowse(e.target.files); e.target.value = ''; }}
            />
            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { handleBrowse(e.target.files); e.target.value = ''; }}
            />
            <Button
              icon={<DocumentArrowUp16Regular />}
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              Browse file…
            </Button>
            {mode === 'jsonl' && (
              <Button
                icon={<FolderArrowUp16Regular />}
                onClick={() => folderInputRef.current?.click()}
                disabled={loading}
              >
                Browse folder…
              </Button>
            )}
          </div>

          <h3>Server path</h3>
          <div className="input-group">
            <Input
              className="grow"
              input={{ className: 'mono' }}
              placeholder={
                mode === 'jsonl'
                  ? 'C:\\data\\export.jsonl or a folder'
                  : 'C:\\data\\config.json'
              }
              value={pathInput}
              onChange={(_, d) => setPathInput(d.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadFromPath()}
              spellCheck={false}
            />
            <Button
              appearance="primary"
              onClick={loadFromPath}
              disabled={loading || !pathInput.trim()}
              icon={loading ? <Spinner size="tiny" /> : undefined}
            >
              Load
            </Button>
          </div>

          <h3>Or paste {mode.toUpperCase()}</h3>
          <Textarea
            className="paste-area"
            textarea={{ className: 'mono' }}
            placeholder={
              mode === 'jsonl'
                ? '{"a":1}\n{"a":2}\n…one JSON object per line'
                : '{\n  "key": "value"\n}'
            }
            value={pasteText}
            onChange={(_, d) => setPasteText(d.value)}
            spellCheck={false}
          />
          <Button
            style={{ width: '100%', marginTop: 6 }}
            onClick={loadFromPaste}
            disabled={loading || !pasteText.trim()}
          >
            View pasted {mode.toUpperCase()}
          </Button>

          {mode === 'jsonl' && files.length > 0 && (
            <>
              <h3>Files ({files.length})</h3>
              {files.map((f) => (
                <div
                  key={f.path}
                  className={`file-item ${activePath === f.path ? 'active' : ''}`}
                  onClick={() => openServerFile(f)}
                  title={f.path}
                >
                  <div className="name">{f.name}</div>
                  <div className="meta">
                    {formatNum(f.lineCount)} records · {formatBytes(f.size)}
                  </div>
                </div>
              ))}
              {files.length > 1 && (
                <div
                  className="muted"
                  style={{ padding: 10, fontSize: 11, borderTop: '1px solid var(--border)', marginTop: 8 }}
                >
                  Total: {formatNum(totalRecords)} records
                </div>
              )}
            </>
          )}
        </div>

        <div className="main">
          {!view && (
            <div className="empty-state">
              <div className="big">⬢</div>
              <div>
                <div style={{ fontSize: 15, color: 'var(--text)' }}>
                  Visualize {mode === 'jsonl' ? 'JSONL' : 'JSON'} data
                </div>
                <div style={{ marginTop: 6 }}>
                  Pick <b>JSON</b> or <b>JSONL</b> on the left, then load a local
                  path or paste content.
                </div>
              </div>
            </div>
          )}

          {view?.kind === 'table' && (
            <>
              <div className="main-toolbar">
                <span className="badge mono">{view.meta.name}</span>
                <span>{formatNum(view.total)} records</span>
                {view.meta.size != null && (
                  <span className="muted">· {formatBytes(view.meta.size)}</span>
                )}
                <span className="muted">
                  · {view.columns.metaColumns.length} meta + {view.columns.recordColumns.length} record cols
                </span>
                <span className="grow" />
                {view.meta.pasted ? (
                  <span className="muted">pasted source</span>
                ) : (
                  <span className="muted" title={view.meta.path}>
                    {view.meta.path}
                  </span>
                )}
              </div>
              <VirtualTable
                key={view.sourceId}
                sourceId={view.sourceId}
                total={view.total}
                columns={view.columns}
                fetchPage={view.fetchPage}
                onOpenJson={(data, title) => setJsonModal({ data, title })}
                onCount={(col) =>
                  setCountModal({
                    column: col.fullName || col.key,
                    runCount: view.makeCounter(col.key, col.scope),
                  })
                }
              />
            </>
          )}

          {view?.kind === 'json' && (
            <>
              <div className="main-toolbar">
                <span className="badge mono">{view.title}</span>
                {view.meta?.size != null && (
                  <span className="muted">· {formatBytes(view.meta.size)}</span>
                )}
                <span className="grow" />
                <Button
                  size="small"
                  appearance="secondary"
                  onClick={() => setJsonModal({ data: view.data, title: view.title })}
                >
                  Open in popup
                </Button>
              </div>
              <div className="json-view">
                <JsonTree data={view.data} />
              </div>
            </>
          )}
        </div>
      </div>

      {jsonModal && (
        <Modal title={jsonModal.title} onClose={() => setJsonModal(null)}>
          <JsonTree data={jsonModal.data} />
        </Modal>
      )}

      {countModal && (
        <Modal
          title={`Column count · ${countModal.column}`}
          onClose={() => setCountModal(null)}
        >
          <CountPanel column={countModal.column} runCount={countModal.runCount} />
        </Modal>
      )}
    </div>
  );
}
