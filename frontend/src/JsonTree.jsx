import React, { useState } from 'react';

function Primitive({ value }) {
  if (value === null) return <span className="jt-null">null</span>;
  const t = typeof value;
  if (t === 'string') return <span className="jt-string">"{value}"</span>;
  if (t === 'number') return <span className="jt-number">{String(value)}</span>;
  if (t === 'boolean') return <span className="jt-boolean">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function Node({ name, value, depth, defaultOpen }) {
  const isObject = value !== null && typeof value === 'object';
  const [open, setOpen] = useState(defaultOpen ?? depth < 2);

  if (!isObject) {
    return (
      <div className="jt-row">
        {name !== undefined && <span className="jt-key">{name}</span>}
        {name !== undefined && <span className="jt-punct">: </span>}
        <Primitive value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((v, i) => [i, v])
    : Object.entries(value);
  const openBrace = isArray ? '[' : '{';
  const closeBrace = isArray ? ']' : '}';

  return (
    <div className="jt-row">
      <span className="jt-toggle" onClick={() => setOpen((o) => !o)}>
        {entries.length ? (open ? '▾' : '▸') : ' '}
      </span>
      {name !== undefined && <span className="jt-key">{name}</span>}
      {name !== undefined && <span className="jt-punct">: </span>}
      <span className="jt-punct">{openBrace}</span>
      {!open && entries.length > 0 && (
        <span className="jt-punct" onClick={() => setOpen(true)} style={{ cursor: 'pointer' }}>
          {' '}… {entries.length} {isArray ? 'items' : 'keys'}{' '}
        </span>
      )}
      {open && (
        <div className="jt-children">
          {entries.map(([k, v]) => (
            <Node key={k} name={isArray ? undefined : k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
      <span className="jt-punct">{closeBrace}</span>
    </div>
  );
}

export default function JsonTree({ data }) {
  return (
    <div className="json-tree">
      <Node value={data} depth={0} defaultOpen />
    </div>
  );
}
