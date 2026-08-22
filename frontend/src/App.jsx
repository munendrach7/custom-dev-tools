import React, { useEffect, useState } from 'react';
import { Card, Button, Spinner } from '@fluentui/react-components';
import JsonlApp from './JsonlApp';
import AuthGate from './apiclient/AuthGate';
import ApiClientApp from './apiclient/ApiClientApp';
import { clientApi, getToken, setToken } from './apiclient/clientApi';

// Registry of dev tools. Add future tools here.
const TOOLS = [
  {
    id: 'jsonl',
    name: 'JSON / JSONL Viewer',
    icon: '⬢',
    tagline: 'Explore JSON & massive JSONL files',
    desc: 'Virtualized table for millions of records, collapsible JSON tree, and per-column value counts.',
  },
  {
    id: 'apiclient',
    name: 'API Client',
    icon: '⇅',
    tagline: 'A Postman-like REST client',
    desc: 'Collections, environment variables, auth, response timing & download. Requests are proxied server-side (no CORS).',
  },
];

function Launcher({ onOpen }) {
  return (
    <div className="launcher">
      <div className="launcher-head">
        <div className="launcher-logo">🧰</div>
        <h1>Custom Dev Tools</h1>
        <p className="muted">Select a tool to get started.</p>
      </div>
      <div className="tool-grid">
        {TOOLS.map((t) => (
          <Card key={t.id} className="tool-card" onClick={() => onOpen(t.id)}>
            <div className="tool-icon">{t.icon}</div>
            <div className="tool-name">{t.name}</div>
            <div className="tool-tagline">{t.tagline}</div>
            <div className="tool-desc muted">{t.desc}</div>
            <Button appearance="primary" className="tool-open-btn">Open →</Button>
          </Card>
        ))}
      </div>
      <div className="launcher-foot muted">Custom Dev Tools</div>
    </div>
  );
}

// Auth wrapper for the API Client: validates any stored token, else shows AuthGate.
function ApiClientGate({ onBack }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!getToken()) { setChecking(false); return; }
    clientApi.me()
      .then((u) => { if (alive) setUser(u); })
      .catch(() => setToken(''))
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, []);

  if (checking) {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <Spinner size="tiny" label="Checking session…" labelPosition="after" />
        </div>
      </div>
    );
  }

  if (!user) return <AuthGate onAuthed={setUser} onBack={onBack} />;
  return <ApiClientApp user={user} onBack={onBack} onLogout={() => setUser(null)} />;
}

export default function App() {
  const [tool, setTool] = useState('menu');

  if (tool === 'jsonl') return <JsonlApp onBack={() => setTool('menu')} />;
  if (tool === 'apiclient') return <ApiClientGate onBack={() => setTool('menu')} />;
  return <Launcher onOpen={setTool} />;
}
