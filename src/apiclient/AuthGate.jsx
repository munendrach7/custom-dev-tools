import React, { useState } from 'react';
import { Button, Input, Field, TabList, Tab, Spinner } from '@fluentui/react-components';
import { clientApi, setToken } from './clientApi';

// Login / register gate for the API Client. On success, stores JWT and
// calls onAuthed(user).
export default function AuthGate({ onAuthed, onBack }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res =
        tab === 'login'
          ? await clientApi.login(username.trim(), password)
          : await clientApi.register(username.trim(), password, email.trim() || null);
      setToken(res.access_token);
      onAuthed(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="logo">⇅</span>
          <div>
            <div className="auth-title">API Client</div>
            <div className="muted" style={{ fontSize: 12 }}>Sign in to sync collections & history</div>
          </div>
        </div>

        <TabList
          selectedValue={tab}
          onTabSelect={(_, d) => setTab(d.value)}
          style={{ margin: '4px 0 14px' }}
        >
          <Tab value="login">Login</Tab>
          <Tab value="register">Register</Tab>
        </TabList>

        {error && <div className="error-banner" style={{ margin: '0 0 12px' }}>⚠ {error}</div>}

        <form onSubmit={submit} className="auth-form">
          <Field label="Username">
            <Input value={username} onChange={(_, d) => setUsername(d.value)} autoFocus spellCheck={false} />
          </Field>
          {tab === 'register' && (
            <Field label="Email (optional)">
              <Input value={email} onChange={(_, d) => setEmail(d.value)} spellCheck={false} />
            </Field>
          )}
          <Field label="Password">
            <Input type="password" value={password} onChange={(_, d) => setPassword(d.value)} />
          </Field>
          <Button
            appearance="primary"
            type="submit"
            disabled={busy || !username.trim() || !password}
            style={{ marginTop: 12 }}
            icon={busy ? <Spinner size="tiny" /> : undefined}
          >
            {tab === 'login' ? 'Login' : 'Create account'}
          </Button>
        </form>

        <Button appearance="transparent" onClick={onBack} style={{ marginTop: 14 }}>← Back to tools menu</Button>
      </div>
    </div>
  );
}
