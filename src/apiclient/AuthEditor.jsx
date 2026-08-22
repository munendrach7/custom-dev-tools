import React from 'react';
import { Field, Select, Input } from '@fluentui/react-components';

// Editor for a request's authorization config.
export default function AuthEditor({ auth, onChange }) {
  const type = auth?.type || 'none';
  const set = (patch) => onChange({ ...auth, ...patch });

  return (
    <div className="auth-editor">
      <Field label="Type" orientation="horizontal">
        <Select value={type} onChange={(e) => onChange({ type: e.target.value })}>
          <option value="none">No Auth</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="apikey">API Key</option>
        </Select>
      </Field>

      {type === 'bearer' && (
        <Field label="Token" orientation="horizontal">
          <Input input={{ className: 'mono' }} placeholder="token or {{var}}" value={auth.token || ''} onChange={(_, d) => set({ token: d.value })} spellCheck={false} />
        </Field>
      )}

      {type === 'basic' && (
        <>
          <Field label="Username" orientation="horizontal">
            <Input input={{ className: 'mono' }} value={auth.username || ''} onChange={(_, d) => set({ username: d.value })} spellCheck={false} />
          </Field>
          <Field label="Password" orientation="horizontal">
            <Input input={{ className: 'mono' }} value={auth.password || ''} onChange={(_, d) => set({ password: d.value })} spellCheck={false} />
          </Field>
        </>
      )}

      {type === 'apikey' && (
        <>
          <Field label="Key" orientation="horizontal">
            <Input input={{ className: 'mono' }} placeholder="e.g. X-API-Key" value={auth.key || ''} onChange={(_, d) => set({ key: d.value })} spellCheck={false} />
          </Field>
          <Field label="Value" orientation="horizontal">
            <Input input={{ className: 'mono' }} placeholder="value or {{var}}" value={auth.value || ''} onChange={(_, d) => set({ value: d.value })} spellCheck={false} />
          </Field>
          <Field label="Add to" orientation="horizontal">
            <Select value={auth.in || 'header'} onChange={(e) => set({ in: e.target.value })}>
              <option value="header">Header</option>
              <option value="query">Query Param</option>
            </Select>
          </Field>
        </>
      )}

      {type === 'none' && <div className="muted" style={{ padding: '4px 2px' }}>This request does not use authorization.</div>}
    </div>
  );
}
