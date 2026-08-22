import React, { useEffect, useState } from 'react';
import { Field, Input, Select, Button } from '@fluentui/react-components';
import { Add16Regular, Delete16Regular } from '@fluentui/react-icons';
import Modal from '../Modal';
import KeyValueEditor from './KeyValueEditor';
import { clientApi } from './clientApi';
import { useDialogs } from './useDialogs';

// Manage environments and their variables. Variables use {{key}} interpolation
// in URLs, headers, params, body, and auth fields at send time.
export default function EnvironmentsModal({ environments, collections, onClose, onChanged }) {
  const [selectedId, setSelectedId] = useState(environments[0]?.id ?? null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [vars, setVars] = useState([]);
  const [saved, setSaved] = useState(true);
  const { askPrompt, askConfirm, dialogNode } = useDialogs();

  const selected = environments.find((e) => e.id === selectedId) || null;

  // Sync local editing state whenever the selected environment changes.
  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setScope(selected.collection_id ?? '');
      setVars(selected.variables || []);
      setSaved(true);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createEnv = async () => {
    const n = await askPrompt({ title: 'New environment', label: 'Environment name', defaultValue: 'New Environment', okText: 'Create' });
    if (!n) return;
    try {
      const env = await clientApi.createEnvironment({ name: n, collection_id: null, variables: [] });
      await onChanged();
      setSelectedId(env.id);
    } catch (e) { setError(e.message); }
  };

  const saveEnv = async () => {
    if (!selected) return;
    try {
      await clientApi.updateEnvironment(selected.id, {
        name,
        collection_id: scope === '' ? null : Number(scope),
        variables: vars,
      });
      await onChanged();
      setSaved(true);
    } catch (e) { setError(e.message); }
  };

  const removeEnv = async () => {
    if (!selected) return;
    if (!(await askConfirm({ title: 'Delete environment', message: `Delete environment "${selected.name}"?`, okText: 'Delete', danger: true }))) return;
    try {
      await clientApi.deleteEnvironment(selected.id);
      await onChanged();
      setSelectedId(null);
    } catch (e) { setError(e.message); }
  };

  const touch = (fn) => (v) => { fn(v); setSaved(false); };

  return (
    <Modal title="Environments & Variables" onClose={onClose} wide>
      {error && <div className="error-banner" style={{ margin: '0 0 10px' }}>⚠ {error}</div>}
      <div className="env-modal">
        <div className="env-list">
          {environments.map((en) => (
            <div key={en.id} className={`env-item ${selectedId === en.id ? 'active' : ''}`} onClick={() => setSelectedId(en.id)}>
              {en.name}
            </div>
          ))}
          <Button size="small" appearance="secondary" icon={<Add16Regular />} style={{ margin: 6 }} onClick={createEnv}>New environment</Button>
        </div>
        <div className="env-detail">
          {!selected && <div className="muted">Select or create an environment.</div>}
          {selected && (
            <>
              <Field label="Name" orientation="horizontal">
                <Input value={name} onChange={(_, d) => touch(setName)(d.value)} spellCheck={false} />
              </Field>
              <Field label="Scope" orientation="horizontal" hint="Collection-scoped variables auto-apply to that collection's requests.">
                <Select value={scope} onChange={(e) => touch(setScope)(e.target.value)}>
                  <option value="">Global</option>
                  {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <h4 style={{ margin: '12px 0 6px', fontSize: 12, color: 'var(--text-muted)' }}>VARIABLES</h4>
              <KeyValueEditor
                rows={vars}
                onChange={touch(setVars)}
                keyPlaceholder="name (use as {{name}})"
                valuePlaceholder="value"
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
                <Button appearance="primary" onClick={saveEnv} disabled={saved}>{saved ? 'Saved' : 'Save changes'}</Button>
                <span className="grow" />
                <Button appearance="subtle" icon={<Delete16Regular />} onClick={removeEnv} style={{ color: 'var(--red)' }}>
                  Delete environment
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      {dialogNode}
    </Modal>
  );
}
