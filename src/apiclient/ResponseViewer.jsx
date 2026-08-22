import React, { useMemo, useState } from 'react';
import { Spinner, Button, TabList, Tab } from '@fluentui/react-components';
import { Copy16Regular, ArrowDownload16Regular } from '@fluentui/react-icons';
import JsonTree from '../JsonTree';
import { formatBytes } from '../api';

function statusClass(status) {
  if (status === 0) return 'status-err';
  if (status >= 200 && status < 300) return 'status-2xx';
  if (status >= 300 && status < 400) return 'status-3xx';
  if (status >= 400 && status < 500) return 'status-4xx';
  return 'status-5xx';
}

function download(filename, text, mime = 'application/octet-stream') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ResponseViewer({ response, loading }) {
  const [tab, setTab] = useState('pretty'); // pretty | raw | headers
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    if (!response || !response.is_json || !response.body) return null;
    try {
      return JSON.parse(response.body);
    } catch {
      return null;
    }
  }, [response]);

  if (loading) {
    return (
      <div className="resp-empty">
        <Spinner size="small" label="Sending request…" labelPosition="after" />
      </div>
    );
  }

  if (!response) {
    return (
      <div className="resp-empty">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>⇅</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Send a request to see the response here.
          </div>
        </div>
      </div>
    );
  }

  const ext = response.is_json ? 'json' : (response.content_type.includes('html') ? 'html' : 'txt');
  const headerText = Object.entries(response.headers || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(response.body || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  // Fall back to raw when the pretty tab is selected but body is not JSON.
  const activeTab = tab === 'pretty' && parsed == null ? 'raw' : tab;

  return (
    <div className="resp">
      <div className="resp-meta">
        <span className={`status-pill ${statusClass(response.status)}`}>
          {response.status === 0 ? 'ERR' : response.status} {response.status_text}
        </span>
        <span className="resp-stat" title="Round-trip time">⏱ {response.time_ms} ms</span>
        <span className="resp-stat" title="Response size">⬇ {formatBytes(response.size_bytes)}</span>
        {response.content_type && (
          <span className="resp-stat muted" title="Content-Type">{response.content_type.split(';')[0]}</span>
        )}
        <span className="grow" />
        <Button size="small" appearance="secondary" icon={<Copy16Regular />} onClick={doCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        <Button
          size="small"
          appearance="secondary"
          icon={<ArrowDownload16Regular />}
          onClick={() =>
            download(
              `response-${Date.now()}.${ext}`,
              response.body || '',
              response.content_type || 'text/plain'
            )
          }
        >
          Download
        </Button>
      </div>

      {response.error && <div className="error-banner" style={{ margin: '8px 12px' }}>⚠ {response.error}</div>}

      <TabList
        className="resp-tabs"
        selectedValue={activeTab}
        onTabSelect={(_, d) => setTab(d.value)}
      >
        {parsed != null && <Tab value="pretty">Pretty</Tab>}
        <Tab value="raw">Raw</Tab>
        <Tab value="headers">Headers ({Object.keys(response.headers || {}).length})</Tab>
      </TabList>

      <div className="resp-body">
        {activeTab === 'pretty' && parsed != null && (
          <div className="json-view" style={{ padding: 12 }}>
            <JsonTree data={parsed} />
          </div>
        )}
        {activeTab === 'raw' && <pre className="resp-pre mono">{response.body || '(empty body)'}</pre>}
        {activeTab === 'headers' && <pre className="resp-pre mono">{headerText || '(no headers)'}</pre>}
      </div>
    </div>
  );
}
