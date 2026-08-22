"""Pydantic schemas for request/response validation."""
from typing import Any, List, Optional
from pydantic import BaseModel


# ---- Auth ----
class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- Collections ----
class CollectionCreate(BaseModel):
    name: str
    description: str = ""


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class RequestOut(BaseModel):
    id: int
    collection_id: int
    name: str
    method: str
    url: str
    headers: Any = []
    params: Any = []
    body_type: str = "none"
    body: str = ""
    auth: Any = {}
    sort_order: int = 0

    class Config:
        from_attributes = True


class CollectionOut(BaseModel):
    id: int
    name: str
    description: str = ""
    requests: List[RequestOut] = []

    class Config:
        from_attributes = True


# ---- Requests ----
class RequestCreate(BaseModel):
    name: str = "New Request"
    method: str = "GET"
    url: str = ""
    headers: Any = []
    params: Any = []
    body_type: str = "none"
    body: str = ""
    auth: Any = {}
    sort_order: int = 0


class RequestUpdate(BaseModel):
    name: Optional[str] = None
    method: Optional[str] = None
    url: Optional[str] = None
    headers: Optional[Any] = None
    params: Optional[Any] = None
    body_type: Optional[str] = None
    body: Optional[str] = None
    auth: Optional[Any] = None
    sort_order: Optional[int] = None


# ---- Environments ----
class EnvVar(BaseModel):
    key: str = ""
    value: str = ""
    enabled: bool = True


class EnvironmentCreate(BaseModel):
    name: str
    collection_id: Optional[int] = None
    variables: List[EnvVar] = []


class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    collection_id: Optional[int] = None
    variables: Optional[List[EnvVar]] = None


class EnvironmentOut(BaseModel):
    id: int
    name: str
    collection_id: Optional[int] = None
    variables: Any = []

    class Config:
        from_attributes = True


# ---- Send (proxy) ----
class KV(BaseModel):
    key: str = ""
    value: str = ""
    enabled: bool = True


class SendRequest(BaseModel):
    method: str = "GET"
    url: str
    headers: List[KV] = []
    params: List[KV] = []
    body_type: str = "none"
    body: str = ""
    auth: Any = {}
    # Optional environment variables to interpolate {{var}} tokens.
    variables: List[EnvVar] = []


class SendResponse(BaseModel):
    status: int
    status_text: str
    time_ms: int
    size_bytes: int
    headers: dict
    body: str
    content_type: str
    is_json: bool
    error: Optional[str] = None


class HistoryOut(BaseModel):
    id: int
    method: str
    url: str
    status: Optional[int] = None
    time_ms: Optional[int] = None
    size_bytes: Optional[int] = None

    class Config:
        from_attributes = True
