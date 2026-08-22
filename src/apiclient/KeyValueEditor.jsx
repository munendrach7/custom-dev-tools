import React from 'react';
import { Checkbox, Input, Button } from '@fluentui/react-components';
import { Delete16Regular, Add16Regular } from '@fluentui/react-icons';

// Editable list of enabled key/value rows (headers, query params, env vars).
export default function KeyValueEditor({ rows, onChange, keyPlaceholder = 'key', valuePlaceholder = 'value' }) {
  const update = (i, patch) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { key: '', value: '', enabled: true }]);

  return (
    <div className="kv-editor">
      {rows.length === 0 && <div className="muted kv-empty">No entries yet.</div>}
      {rows.map((r, i) => (
        <div className="kv-row" key={i}>
          <Checkbox
            checked={r.enabled !== false}
            onChange={(_, d) => update(i, { enabled: !!d.checked })}
            title="Enable/disable"
          />
          <Input
            className="kv-input"
            input={{ className: 'mono' }}
            placeholder={keyPlaceholder}
            value={r.key}
            onChange={(_, d) => update(i, { key: d.value })}
            spellCheck={false}
          />
          <Input
            className="kv-input"
            input={{ className: 'mono' }}
            placeholder={valuePlaceholder}
            value={r.value}
            onChange={(_, d) => update(i, { value: d.value })}
            spellCheck={false}
          />
          <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => remove(i)} title="Remove" />
        </div>
      ))}
      <Button size="small" appearance="secondary" icon={<Add16Regular />} className="kv-add" onClick={add}>Add row</Button>
    </div>
  );
}
