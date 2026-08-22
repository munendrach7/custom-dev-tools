import React, { useEffect, useState } from 'react';
import { formatNum } from './api';

export default function CountPanel({ column, runCount }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.resolve(runCount())
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [runCount]);

  if (loading)
    return (
      <div className="muted">
        <span className="spinner" /> Scanning entire file for column{' '}
        <b>{column}</b>…
      </div>
    );
  if (error) return <div className="err">{error}</div>;
  if (!data) return null;

  const maxCount = data.topValues.length ? data.topValues[0].count : 0;

  return (
    <div>
      <div className="count-summary">
        <div className="stat">
          <div className="label">Total rows</div>
          <div className="value">{formatNum(data.total)}</div>
        </div>
        <div className="stat">
          <div className="label">Non-empty</div>
          <div className="value" style={{ color: 'var(--green)' }}>
            {formatNum(data.nonNull)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Empty / missing</div>
          <div className="value" style={{ color: 'var(--text-muted)' }}>
            {formatNum(data.nullOrMissing)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Distinct values</div>
          <div className="value" style={{ color: 'var(--accent)' }}>
            {formatNum(data.distinctCount)}
            {data.distinctCapped ? '+' : ''}
          </div>
        </div>
      </div>

      <div style={{ maxHeight: '45vh', overflow: 'auto' }}>
        <table className="count-table">
          <thead>
            <tr>
              <th>Value</th>
              <th style={{ textAlign: 'right', width: 120 }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {data.topValues.map((row, i) => (
              <tr key={i}>
                <td className="mono" style={{ maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.value}
                  <div
                    className="bar"
                    style={{ width: `${maxCount ? (row.count / maxCount) * 100 : 0}%` }}
                  />
                </td>
                <td className="num">{formatNum(row.count)}</td>
              </tr>
            ))}
            {data.topValues.length === 0 && (
              <tr>
                <td colSpan={2} className="muted">
                  No non-empty values found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data.distinctCapped && (
        <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
          Distinct-value tracking was capped at 20,000 unique values for memory
          safety; counts above reflect the most frequent values seen.
        </div>
      )}
    </div>
  );
}
