"""ORM models for users, collections, environments, requests, and history."""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Boolean
)
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    email = Column(String(200), nullable=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    collections = relationship("Collection", back_populates="owner", cascade="all, delete-orphan")
    environments = relationship("Environment", back_populates="owner", cascade="all, delete-orphan")
    history = relationship("HistoryEntry", back_populates="owner", cascade="all, delete-orphan")


class Collection(Base):
    __tablename__ = "collections"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="collections")
    requests = relationship(
        "ApiRequest", back_populates="collection",
        cascade="all, delete-orphan", order_by="ApiRequest.sort_order",
    )
    environments = relationship("Environment", back_populates="collection", cascade="all, delete-orphan")


class Environment(Base):
    __tablename__ = "environments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Null collection_id => a global environment usable across collections.
    collection_id = Column(Integer, ForeignKey("collections.id"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    # Variables stored as JSON string: [{"key":..,"value":..,"enabled":bool}]
    variables = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="environments")
    collection = relationship("Collection", back_populates="environments")


class ApiRequest(Base):
    __tablename__ = "requests"
    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("collections.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False, default="New Request")
    method = Column(String(10), nullable=False, default="GET")
    url = Column(Text, default="")
    # JSON strings for structured fields.
    headers = Column(Text, default="[]")   # [{"key","value","enabled"}]
    params = Column(Text, default="[]")    # [{"key","value","enabled"}]
    body_type = Column(String(20), default="none")  # none|json|text|form
    body = Column(Text, default="")
    auth = Column(Text, default="{}")      # {"type":"none|bearer|basic|apikey", ...}
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    collection = relationship("Collection", back_populates="requests")


class HistoryEntry(Base):
    __tablename__ = "history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    method = Column(String(10))
    url = Column(Text)
    status = Column(Integer)
    time_ms = Column(Integer)
    size_bytes = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="history")
