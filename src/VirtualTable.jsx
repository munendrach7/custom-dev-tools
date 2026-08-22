import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const ROW_H = 34;
const HEADER_H = 52;
const PAGE = 200;
const OVERSCAN = 12;

const IDX_WIDTH = 84;
const DEFAULT_WIDTH = 220;
const NESTED_WIDTH = 110;

function buildColumns(columns) {
  const cols = [
    { id: '__index', label: '#', group: 'idx', width: IDX_WIDTH },
  ];
  for (const k of columns.metaColumns || []) {
    cols.push({ id: 'meta:' + k, key: k, fullName: k, group: 'meta', scope: 'meta', width: DEFAULT_WIDTH });
  }
  for (const c of columns.recordColumns || []) {
    cols.push({
      id: 'rec:' + c.key,
      key: c.key,
      fullName: '_record.' + c.key,
      group: 'record',
      scope: 'record',
      nested: c.nested,
      width: c.nested ? NESTED_WIDTH : DEFAULT_WIDTH,
    });
  }
  return cols;
}

function getCellValue(record, col) {
  if (!record) return undefined;
  if (col.group === 'meta') return record[col.key];
  if (col.group === 'record') {
    const rec = record._record;
    return rec ? rec[col.key] : undefined;
  }
  return undefined;
}

export default function VirtualTable({ sourceId, total, columns, fetchPage, onOpenJson, onCount }) {
  const scrollRef = useRef(null);
  const cacheRef = useRef(new Map()); // index -> record
  const pendingRef = useRef(new Set()); // page numbers in-flight
  const tokenRef = useRef(0);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const [, forceTick] = useState(0);
  const rerender = useCallback(() => forceTick((t) => t + 1), []);

  const cols = useMemo(() => buildColumns(columns), [columns]);
  const colLayout = useMemo(() => {
    let left = 0;
    const items = cols.map((c) => {
      const item = { ...c, left };
      left += c.width;
      return item;
    });
    return { items, totalWidth: left };
  }, [cols]);

  // Reset caches when the data source changes.
  useEffect(() => {
    cacheRef.current = new Map();
    pendingRef.current = new Set();
    tokenRef.current += 1;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
    rerender();
  }, [sourceId, rerender]);

  // Track viewport height.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2;
  const endIndex = Math.min(total, startIndex + visibleCount);

  // Ensure the pages covering the visible range are loaded.
  useEffect(() => {
    if (!sourceId || total === 0) return;
    const firstPage = Math.floor(startIndex / PAGE);
    const lastPage = Math.floor((Math.max(startIndex, endIndex - 1)) / PAGE);
    const myToken = tokenRef.current;
    for (let p = firstPage; p <= lastPage; p++) {
      if (pendingRef.current.has(p)) continue;
      const already = cacheRef.current.has(p * PAGE);
      if (already) continue;
      pendingRef.current.add(p);
      Promise.resolve(fetchPage(p * PAGE, PAGE))
        .then((res) => {
          if (tokenRef.current !== myToken) return;
          for (const rec of res.records) {
            cacheRef.current.set(rec.__index, rec);
          }
          pendingRef.current.delete(p);
          rerender();
        })
        .catch(() => {
          pendingRef.current.delete(p);
        });
    }
  }, [sourceId, total, startIndex, endIndex, fetchPage, rerender]);

  const onScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const rows = [];
  for (let i = startIndex; i < endIndex; i++) {
    const record = cacheRef.current.get(i);
    rows.push(
      <div className="vrow" key={i} style={{ top: i * ROW_H, width: colLayout.totalWidth }}>
        {colLayout.items.map((col) => {
          if (col.group === 'idx') {
            return (
              <div
                key={col.id}
                className="vcell idx"
                style={{ width: col.width }}
                title="Open full record JSON"
                onClick={() => record && onOpenJson(record, `Record #${i}`)}
              >
                <span style={{ cursor: record ? 'pointer' : 'default' }}>{i}</span>
              </div>
            );
          }
          if (!record) {
            return (
              <div key={col.id} className="vcell skel" style={{ width: col.width }}>
                ·
              </div>
            );
          }
          if (record.__error) {
            return (
              <div key={col.id} className="vcell err mono" style={{ width: col.width }}>
                parse error
              </div>
            );
          }
          const value = getCellValue(record, col);
          return (
            <div key={col.id} className="vcell" style={{ width: col.width }}>
              {renderCell(value, () =>
                onOpenJson(value, `${col.key} — Record #${i}`)
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="table-wrap" ref={scrollRef} onScroll={onScroll}>
      <div className="vtable" style={{ height: total * ROW_H + HEADER_H, width: colLayout.totalWidth }}>
        <div className="vhead" style={{ width: colLayout.totalWidth }}>
          {colLayout.items.map((col) => {
            if (col.group === 'idx') {
              return (
                <div key={col.id} className="hcell vcell idx" style={{ width: col.width }}>
                  <span className="hname">#</span>
                </div>
              );
            }
            return (
              <div key={col.id} className="hcell" style={{ width: col.width }}>
                <span className={`hname hgroup-${col.group}`} title={col.fullName}>
                  {col.fullName}
                  {col.nested ? ' { }' : ''}
                </span>
                <div className="hactions">
                  <button
                    className="mini-btn"
                    title="Count rows by value across the whole file"
                    onClick={() => onCount(col)}
                  >
                    Σ count
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', top: HEADER_H, left: 0, right: 0 }}>
          <div style={{ position: 'relative', height: total * ROW_H }}>{rows}</div>
        </div>
      </div>
    </div>
  );
}

function renderCell(value, openJson) {
  if (value === undefined || value === null) {
    return <span className="muted">—</span>;
  }
  if (typeof value === 'object') {
    const isArr = Array.isArray(value);
    const size = isArr ? value.length : Object.keys(value).length;
    return (
      <button className="json-btn" onClick={openJson} title="Open JSON viewer">
        {isArr ? `[ ${size} ]` : `{ ${size} }`} view
      </button>
    );
  }
  const str = String(value);
  return (
    <span className="cell-text" title={str}>
      {str}
    </span>
  );
}
