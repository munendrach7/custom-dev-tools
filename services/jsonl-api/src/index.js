const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const readline = require('readline');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5178;

/**
 * In-memory cache of per-file line indexes.
 * key: absolute path -> { mtimeMs, size, offsets: number[] (byte offset of start of each line), lineCount }
 * offsets has lineCount + 1 entries: last entry is the EOF byte offset.
 */
const indexCache = new Map();

function isJsonlFile(name) {
  return /\.(jsonl|ndjson|jsonlines)$/i.test(name);
}

/** Resolve a user provided path into a list of jsonl files. */
async function resolvePathToFiles(inputPath) {
  const abs = path.resolve(inputPath);
  const stat = await fsp.stat(abs);
  if (stat.isFile()) {
    return [abs];
  }
  if (stat.isDirectory()) {
    const entries = await fsp.readdir(abs, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && isJsonlFile(e.name))
      .map((e) => path.join(abs, e.name))
      .sort();
    return files;
  }
  return [];
}

/**
 * Build (or reuse cached) an index of byte offsets for every line in the file.
 * Streams the file once so it works for very large files without loading all lines.
 */
async function buildIndex(absPath) {
  const stat = await fsp.stat(absPath);
  const cached = indexCache.get(absPath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached;
  }

  const offsets = [0];
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(absPath, { highWaterMark: 1 << 20 });
    let pos = 0;
    stream.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        pos++;
        if (chunk[i] === 0x0a) {
          offsets.push(pos);
        }
      }
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  // If the file does not end with a newline, the final segment is still a line.
  const lastOffset = offsets[offsets.length - 1];
  if (lastOffset < stat.size) {
    offsets.push(stat.size);
  }

  const lineCount = offsets.length - 1;
  const record = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    offsets,
    lineCount,
  };
  indexCache.set(absPath, record);
  return record;
}

/** Read a slice of raw line strings [start, start+limit) using the offset index. */
async function readLines(absPath, start, limit) {
  const idx = await buildIndex(absPath);
  const total = idx.lineCount;
  const from = Math.max(0, Math.min(start, total));
  const to = Math.max(from, Math.min(start + limit, total));
  if (from >= to) return { lines: [], total };

  const byteStart = idx.offsets[from];
  const byteEnd = idx.offsets[to];
  const length = byteEnd - byteStart;

  const fh = await fsp.open(absPath, 'r');
  try {
    const buf = Buffer.allocUnsafe(length);
    await fh.read(buf, 0, length, byteStart);
    const text = buf.toString('utf8');
    const lines = text.split('\n');
    const wanted = lines.slice(0, to - from);
    return { lines: wanted, total };
  } finally {
    await fh.close();
  }
}

function safeParse(line) {
  try {
    return { ok: true, value: JSON.parse(line) };
  } catch (e) {
    return { ok: false, error: e.message, raw: line };
  }
}

// --- API ROUTES ---

// List jsonl files for a given path (file or folder), with line counts.
app.post('/api/open', async (req, res) => {
  try {
    const { path: inputPath } = req.body || {};
    if (!inputPath || typeof inputPath !== 'string') {
      return res.status(400).json({ error: 'A "path" string is required.' });
    }
    const files = await resolvePathToFiles(inputPath);
    if (files.length === 0) {
      return res.status(404).json({ error: 'No .jsonl/.ndjson files found at that path.' });
    }
    const result = [];
    for (const f of files) {
      const idx = await buildIndex(f);
      const stat = await fsp.stat(f);
      result.push({
        path: f,
        name: path.basename(f),
        lineCount: idx.lineCount,
        size: stat.size,
      });
    }
    res.json({ files: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Infer columns by sampling the first N valid records.
app.post('/api/columns', async (req, res) => {
  try {
    const { path: absPath, sample = 500 } = req.body || {};
    if (!absPath) return res.status(400).json({ error: 'path required' });
    const { lines } = await readLines(absPath, 0, sample);
    const metaKeys = new Set();
    const recordKeys = new Set();
    const recordNested = {};
    let sampled = 0;
    for (const line of lines) {
      const trimmed = line.replace(/\r$/, '');
      if (!trimmed.trim()) continue;
      const p = safeParse(trimmed);
      if (!p.ok) continue;
      sampled++;
      const obj = p.value;
      for (const k of Object.keys(obj)) {
        if (k === '_record') continue;
        metaKeys.add(k);
      }
      const rec = obj._record;
      if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
        for (const k of Object.keys(rec)) {
          recordKeys.add(k);
          const v = rec[k];
          if (v !== null && typeof v === 'object') recordNested[k] = true;
        }
      }
    }
    res.json({
      sampled,
      metaColumns: [...metaKeys],
      recordColumns: [...recordKeys].map((k) => ({ key: k, nested: !!recordNested[k] })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Paginated records.
app.post('/api/records', async (req, res) => {
  try {
    const { path: absPath, start = 0, limit = 100 } = req.body || {};
    if (!absPath) return res.status(400).json({ error: 'path required' });
    const cappedLimit = Math.min(Math.max(1, limit), 2000);
    const { lines, total } = await readLines(absPath, start, cappedLimit);
    const records = lines.map((line, i) => {
      const trimmed = line.replace(/\r$/, '');
      if (!trimmed.trim()) return { __index: start + i, __empty: true };
      const p = safeParse(trimmed);
      if (!p.ok) return { __index: start + i, __error: p.error, __raw: trimmed };
      return { __index: start + i, ...p.value };
    });
    res.json({ records, total, start, limit: cappedLimit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Column value counts via a full streaming scan.
 * Returns non-null count, empty/missing count, distinct-value top list (capped), and total.
 */
app.post('/api/count', async (req, res) => {
  try {
    const { path: absPath, column, scope = 'record', topN = 50 } = req.body || {};
    if (!absPath || !column) return res.status(400).json({ error: 'path and column required' });

    const MAX_DISTINCT = 20000;
    const valueCounts = new Map();
    let total = 0;
    let nonNull = 0;
    let nullOrMissing = 0;
    let distinctCapped = false;

    await new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: fs.createReadStream(absPath, { highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
      });
      rl.on('line', (line) => {
        if (!line.trim()) return;
        total++;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          nullOrMissing++;
          return;
        }
        let container = obj;
        if (scope === 'record') container = obj._record || {};
        const v = container ? container[column] : undefined;
        if (v === undefined || v === null || v === '') {
          nullOrMissing++;
          return;
        }
        nonNull++;
        const key = typeof v === 'object' ? '[object]' : String(v);
        if (valueCounts.has(key)) {
          valueCounts.set(key, valueCounts.get(key) + 1);
        } else if (valueCounts.size < MAX_DISTINCT) {
          valueCounts.set(key, 1);
        } else {
          distinctCapped = true;
        }
      });
      rl.on('close', resolve);
      rl.on('error', reject);
    });

    const sorted = [...valueCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([value, count]) => ({ value, count }));

    res.json({
      column,
      scope,
      total,
      nonNull,
      nullOrMissing,
      distinctCount: valueCounts.size,
      distinctCapped,
      topValues: sorted,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Full streaming search: returns records whose raw line contains the query
 * (case-insensitive substring match) up to a cap. Works on very large files
 * without loading everything into memory.
 */
app.post('/api/search', async (req, res) => {
  try {
    const { path: absPath, query, limit = 5000, caseSensitive = false } = req.body || {};
    if (!absPath || !query || typeof query !== 'string') {
      return res.status(400).json({ error: 'path and query are required' });
    }
    const cap = Math.min(Math.max(1, limit), 20000);
    const needle = caseSensitive ? query : query.toLowerCase();
    const records = [];
    let index = -1;
    let matched = 0;
    let capped = false;

    await new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: fs.createReadStream(absPath, { highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
      });
      rl.on('line', (line) => {
        index++;
        if (!line.trim()) return;
        const hay = caseSensitive ? line : line.toLowerCase();
        if (hay.indexOf(needle) === -1) return;
        matched++;
        if (records.length < cap) {
          const p = safeParse(line);
          if (p.ok) records.push({ __index: index, ...p.value });
          else records.push({ __index: index, __error: p.error, __raw: line });
        } else {
          capped = true;
        }
      });
      rl.on('close', resolve);
      rl.on('error', reject);
    });

    res.json({ query, matched, capped, limit: cap, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read a raw file's text by path (used by the JSON viewer and pasted-source fallbacks).
app.post('/api/readfile', async (req, res) => {
  try {
    const { path: inputPath, maxBytes = 100 * 1024 * 1024 } = req.body || {};
    if (!inputPath || typeof inputPath !== 'string') {
      return res.status(400).json({ error: 'A "path" string is required.' });
    }
    const abs = path.resolve(inputPath);
    const stat = await fsp.stat(abs);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Path is not a file.' });
    }
    if (stat.size > maxBytes) {
      return res.status(413).json({
        error: `File is ${stat.size} bytes, larger than the ${maxBytes}-byte limit for direct reads.`,
      });
    }
    const text = await fsp.readFile(abs, 'utf8');
    res.json({ text, name: path.basename(abs), path: abs, size: stat.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve built client in production if present.
const clientDist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`JSONL Visualizer server running at http://localhost:${PORT}`);
});
