# Custom Dev Tools

A GitHub–dark-themed workspace that hosts multiple developer tools behind a single
launcher. Pick a tool from the home menu and dive in. Built to be extended — more
tools can be added to the registry over time.

Current tools:

| Tool | What it does |
| ---- | ------------ |
| **JSON / JSONL Viewer** | Explore JSON and massive JSONL/NDJSON files in a virtualized table (millions of rows), a collapsible JSON tree, and per-column value counts. |
| **API Client** | A Postman-like REST client: collections, environment variables, request auth, response visualization, timing, size, and download. Backed by SQL with user accounts. |

## Launcher

When the app loads you land on the **tools menu**. Select a card to open a tool; a
**← Tools** button in each tool's top bar returns you to the menu. Adding a new tool
later is just a new entry in `TOOLS` in `src/App.jsx` plus its component.

## API Client (Postman-like)

- **Accounts & auth** — register / login; a JWT is stored in the browser and every
  API-Client call is authenticated. Your collections, environments, and history are
  scoped to your account and **persist in SQL**.
- **Collections & requests** — organize saved requests into collections. Each request
  has a method (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS), URL, query params, headers,
  body (JSON / raw), and authorization.
- **Request auth** — No Auth, Bearer token, Basic auth, or API key (header or query).
- **Environments & variables** — define `{{variable}}` values (global or per-collection)
  and interpolate them into the URL, params, headers, body, and auth at send time.
- **Response visualization** — status pill (color-coded), **response time (ms)**,
  **size**, content type, pretty JSON tree / raw / headers tabs, **copy**, and
  **download** of the response body.
- **History** — recent requests are recorded (method, URL, status, time, size) and can
  be replayed or cleared.
- **No CORS** — the frontend never calls target APIs directly. Every outbound request is
  **proxied server-side** by the Python backend (`POST /client/send`) using `httpx`, so
  browser CORS restrictions never apply.

### Backend

- **`py-server/`** — a **FastAPI (Python)** service backing the API Client:
  - **SQL Server** via SQLAlchemy + `pymssql` in Docker (a dedicated `db` container),
    or SQLite for local dev; JWT auth (bcrypt hashing). Selected by `DATABASE_URL`.
  - Routes under `/client/*`: `auth/register`, `auth/login`, `auth/me`, `collections`,
    `requests`, `environments`, `send` (proxy), and `history`.
- **`server/`** — the original **Express (Node)** service powering the JSON/JSONL viewer
  (byte-offset line index for random access into huge files). Routes under `/api/*`.

## Architecture

```
Browser (React SPA)
   |
   |-- /api/*     -> Node   (server/)     JSON/JSONL file indexing
   \-- /client/*  -> Python (py-server/)  API Client + SQL + outbound proxy
```

In Docker, an **nginx** container serves the built SPA and reverse-proxies `/api` and
`/client` to the two backends.

## Run with Docker (recommended)

```bash
# optional: cp .env.example .env  and set SECRET_KEY
docker compose up --build
```

Then open **http://localhost:8080**.

| Container | Service | Role |
| --------- | ------- | ---- |
| `devtools-web` | `web` (nginx) | Serves the SPA, proxies `/api` and `/client`. |
| `devtools-jsonl-api` | `jsonl-api` (Node) | JSON/JSONL backend. |
| `devtools-api-client` | `api-client` (Python/FastAPI) | API Client backend. |
| `devtools-db` | `db` (SQL Server 2022) | SQL database for accounts, collections, requests, environments, history. |

The SQL Server data lives in the `devtools-db-data` volume, so accounts/collections
**survive restarts** (verified). On boot the `api-client` service creates the app
database if missing and retries the connection while SQL Server starts (~30-60s).

Behind a corporate pip mirror or egress proxy? Set `PIP_INDEX_URL` (build time) and/or
`HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` (runtime) — see `.env.example`.

## Run locally (without Docker)

```bash
npm install
python -m venv py-server/.venv
py-server/.venv/Scripts/pip install -r py-server/requirements.txt   # Windows
# source py-server/.venv/bin/activate && pip install -r py-server/requirements.txt  # *nix

npm run dev     # starts Node (5178) + FastAPI (8000) + Vite (5173)
```

- Frontend: http://localhost:5173 (Vite proxies `/api` -> 5178 and `/client` -> 8000)

> `npm run dev` calls `python` on your PATH for the FastAPI service. Activate the venv
> first, or run `npm run py` separately.

## JSON / JSONL Viewer

Point it at a **single `.jsonl` file** or a **folder** of them, or **paste** JSON/JSONL
directly. Top-level fields and keys inside `_record` become columns; nested values open a
collapsible JSON popup; any column can be counted across the whole file. Supported
extensions: `.jsonl`, `.ndjson`, `.jsonlines`.
