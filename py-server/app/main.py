"""FastAPI application: auth, collections, environments, requests, send-proxy, history.

All outbound HTTP calls are executed here (server-side) so the browser never makes
cross-origin requests — this avoids CORS errors entirely.
"""
import json
import re
import time
from typing import Any, List

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.orm import Session

from . import auth, models, schemas
from .database import Base, engine, ensure_database, get_db


def init_db(retries: int = 40, delay: float = 3.0):
    """Create the database and tables, retrying while the DB server starts up.

    SQL Server can take 30-60s to accept connections on first boot, so we retry
    both the CREATE DATABASE step and table creation.
    """
    last_err = None
    for _ in range(retries):
        try:
            ensure_database()
            Base.metadata.create_all(bind=engine)
            return
        except (OperationalError, InterfaceError, DBAPIError) as exc:
            last_err = exc
            time.sleep(delay)
    raise last_err


init_db()

app = FastAPI(title="Custom Dev Tools — API Client", version="1.0.0")

# CORS is permissive for the local frontend / nginx proxy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

VAR_RE = re.compile(r"\{\{\s*([\w.-]+)\s*\}\}")


# ----------------- helpers -----------------
def _loads(text: str, default: Any):
    try:
        return json.loads(text) if text else default
    except (json.JSONDecodeError, TypeError):
        return default


def request_to_out(r: models.ApiRequest) -> dict:
    return {
        "id": r.id,
        "collection_id": r.collection_id,
        "name": r.name,
        "method": r.method,
        "url": r.url or "",
        "headers": _loads(r.headers, []),
        "params": _loads(r.params, []),
        "body_type": r.body_type or "none",
        "body": r.body or "",
        "auth": _loads(r.auth, {}),
        "sort_order": r.sort_order or 0,
    }


def collection_to_out(c: models.Collection) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description or "",
        "requests": [request_to_out(r) for r in c.requests],
    }


def env_to_out(e: models.Environment) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "collection_id": e.collection_id,
        "variables": _loads(e.variables, []),
    }


def interpolate(text: str, mapping: dict) -> str:
    if not text:
        return text
    return VAR_RE.sub(lambda m: str(mapping.get(m.group(1), m.group(0))), text)


# ----------------- auth -----------------
@app.post("/client/auth/register", response_model=schemas.Token)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    user = models.User(
        username=payload.username,
        email=payload.email,
        password_hash=auth.hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth.create_access_token(user.username)
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.post("/client/auth/login", response_model=schemas.Token)
def login(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = auth.create_access_token(user.username)
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.get("/client/auth/me", response_model=schemas.UserOut)
def me(current: models.User = Depends(auth.get_current_user)):
    return current


# ----------------- collections -----------------
@app.get("/client/collections")
def list_collections(
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    cols = (
        db.query(models.Collection)
        .filter(models.Collection.user_id == current.id)
        .order_by(models.Collection.created_at)
        .all()
    )
    return [collection_to_out(c) for c in cols]


@app.post("/client/collections")
def create_collection(
    payload: schemas.CollectionCreate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    col = models.Collection(user_id=current.id, name=payload.name, description=payload.description)
    db.add(col)
    db.commit()
    db.refresh(col)
    return collection_to_out(col)


def _get_owned_collection(db, current, collection_id) -> models.Collection:
    col = (
        db.query(models.Collection)
        .filter(models.Collection.id == collection_id, models.Collection.user_id == current.id)
        .first()
    )
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return col


@app.patch("/client/collections/{collection_id}")
def update_collection(
    collection_id: int,
    payload: schemas.CollectionUpdate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    col = _get_owned_collection(db, current, collection_id)
    if payload.name is not None:
        col.name = payload.name
    if payload.description is not None:
        col.description = payload.description
    db.commit()
    db.refresh(col)
    return collection_to_out(col)


@app.delete("/client/collections/{collection_id}")
def delete_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    col = _get_owned_collection(db, current, collection_id)
    db.delete(col)
    db.commit()
    return {"ok": True}


# ----------------- requests -----------------
@app.post("/client/collections/{collection_id}/requests")
def create_request(
    collection_id: int,
    payload: schemas.RequestCreate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    _get_owned_collection(db, current, collection_id)
    req = models.ApiRequest(
        collection_id=collection_id,
        name=payload.name,
        method=payload.method,
        url=payload.url,
        headers=json.dumps(payload.headers),
        params=json.dumps(payload.params),
        body_type=payload.body_type,
        body=payload.body,
        auth=json.dumps(payload.auth),
        sort_order=payload.sort_order,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return request_to_out(req)


def _get_owned_request(db, current, request_id) -> models.ApiRequest:
    req = (
        db.query(models.ApiRequest)
        .join(models.Collection)
        .filter(models.ApiRequest.id == request_id, models.Collection.user_id == current.id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return req


@app.patch("/client/requests/{request_id}")
def update_request(
    request_id: int,
    payload: schemas.RequestUpdate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    req = _get_owned_request(db, current, request_id)
    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "method", "url", "body_type", "body", "sort_order"):
        if field in data and data[field] is not None:
            setattr(req, field, data[field])
    for field in ("headers", "params", "auth"):
        if field in data and data[field] is not None:
            setattr(req, field, json.dumps(data[field]))
    db.commit()
    db.refresh(req)
    return request_to_out(req)


@app.delete("/client/requests/{request_id}")
def delete_request(
    request_id: int,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    req = _get_owned_request(db, current, request_id)
    db.delete(req)
    db.commit()
    return {"ok": True}


# ----------------- environments -----------------
@app.get("/client/environments")
def list_environments(
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    envs = (
        db.query(models.Environment)
        .filter(models.Environment.user_id == current.id)
        .order_by(models.Environment.created_at)
        .all()
    )
    return [env_to_out(e) for e in envs]


@app.post("/client/environments")
def create_environment(
    payload: schemas.EnvironmentCreate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    env = models.Environment(
        user_id=current.id,
        name=payload.name,
        collection_id=payload.collection_id,
        variables=json.dumps([v.model_dump() for v in payload.variables]),
    )
    db.add(env)
    db.commit()
    db.refresh(env)
    return env_to_out(env)


def _get_owned_env(db, current, env_id) -> models.Environment:
    env = (
        db.query(models.Environment)
        .filter(models.Environment.id == env_id, models.Environment.user_id == current.id)
        .first()
    )
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env


@app.patch("/client/environments/{env_id}")
def update_environment(
    env_id: int,
    payload: schemas.EnvironmentUpdate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    env = _get_owned_env(db, current, env_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        env.name = data["name"]
    if "collection_id" in data:
        env.collection_id = data["collection_id"]
    if "variables" in data and data["variables"] is not None:
        env.variables = json.dumps(data["variables"])
    db.commit()
    db.refresh(env)
    return env_to_out(env)


@app.delete("/client/environments/{env_id}")
def delete_environment(
    env_id: int,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    env = _get_owned_env(db, current, env_id)
    db.delete(env)
    db.commit()
    return {"ok": True}


# ----------------- send proxy -----------------
def _apply_auth(auth_cfg: dict, headers: dict, params: dict, mapping: dict):
    atype = (auth_cfg or {}).get("type", "none")
    if atype == "bearer":
        token = interpolate(auth_cfg.get("token", ""), mapping)
        if token:
            headers["Authorization"] = f"Bearer {token}"
    elif atype == "basic":
        import base64
        user = interpolate(auth_cfg.get("username", ""), mapping)
        pwd = interpolate(auth_cfg.get("password", ""), mapping)
        raw = f"{user}:{pwd}".encode("utf-8")
        headers["Authorization"] = "Basic " + base64.b64encode(raw).decode("ascii")
    elif atype == "apikey":
        key = interpolate(auth_cfg.get("key", ""), mapping)
        value = interpolate(auth_cfg.get("value", ""), mapping)
        where = auth_cfg.get("in", "header")
        if key:
            if where == "query":
                params[key] = value
            else:
                headers[key] = value


@app.post("/client/send", response_model=schemas.SendResponse)
def send_request(
    payload: schemas.SendRequest,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    mapping = {v.key: v.value for v in payload.variables if v.enabled and v.key}

    url = interpolate(payload.url, mapping).strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "http://" + url

    headers = {
        interpolate(h.key, mapping): interpolate(h.value, mapping)
        for h in payload.headers
        if h.enabled and h.key
    }
    params = {
        interpolate(p.key, mapping): interpolate(p.value, mapping)
        for p in payload.params
        if p.enabled and p.key
    }
    _apply_auth(payload.auth, headers, params, mapping)

    content = None
    if payload.body_type in ("json", "text") and payload.body:
        content = interpolate(payload.body, mapping).encode("utf-8")
        if payload.body_type == "json" and "content-type" not in {k.lower() for k in headers}:
            headers["Content-Type"] = "application/json"

    started = time.perf_counter()
    error = None
    try:
        with httpx.Client(follow_redirects=True, timeout=60.0, verify=False) as client:
            resp = client.request(
                payload.method.upper(),
                url,
                headers=headers,
                params=params,
                content=content,
            )
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        body_bytes = resp.content
        text = ""
        try:
            text = body_bytes.decode(resp.encoding or "utf-8", errors="replace")
        except (LookupError, UnicodeDecodeError):
            text = body_bytes.decode("utf-8", errors="replace")
        ctype = resp.headers.get("content-type", "")
        is_json = "json" in ctype.lower()
        if not is_json and text:
            stripped = text.lstrip()
            if stripped[:1] in ("{", "["):
                try:
                    json.loads(text)
                    is_json = True
                except json.JSONDecodeError:
                    is_json = False
        result = {
            "status": resp.status_code,
            "status_text": resp.reason_phrase or "",
            "time_ms": elapsed_ms,
            "size_bytes": len(body_bytes),
            "headers": dict(resp.headers),
            "body": text,
            "content_type": ctype,
            "is_json": is_json,
            "error": None,
        }
        status_code = resp.status_code
    except httpx.RequestError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        error = f"{type(exc).__name__}: {exc}"
        result = {
            "status": 0,
            "status_text": "Request failed",
            "time_ms": elapsed_ms,
            "size_bytes": 0,
            "headers": {},
            "body": "",
            "content_type": "",
            "is_json": False,
            "error": error,
        }
        status_code = 0

    db.add(models.HistoryEntry(
        user_id=current.id,
        method=payload.method.upper(),
        url=url,
        status=status_code,
        time_ms=elapsed_ms,
        size_bytes=result["size_bytes"],
    ))
    db.commit()
    return result


# ----------------- history -----------------
@app.get("/client/history", response_model=List[schemas.HistoryOut])
def list_history(
    limit: int = 50,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    return (
        db.query(models.HistoryEntry)
        .filter(models.HistoryEntry.user_id == current.id)
        .order_by(models.HistoryEntry.created_at.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )


@app.delete("/client/history")
def clear_history(
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    db.query(models.HistoryEntry).filter(models.HistoryEntry.user_id == current.id).delete()
    db.commit()
    return {"ok": True}


@app.get("/client/health")
def health():
    return {"status": "ok"}
