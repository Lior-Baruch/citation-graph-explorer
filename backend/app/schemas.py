"""Pydantic request/response models for the API."""
from typing import Any, Optional

from pydantic import BaseModel


class ResolveRequest(BaseModel):
    query: str


class ClusterRequest(BaseModel):
    paperIds: list[str]
    edges: list[dict] = []


class LineageRequest(BaseModel):
    sourceId: str
    targetId: str
    edges: list[dict] = []


class ConfigResponse(BaseModel):
    llm_enabled: bool
    s2_key_present: bool
    default_seed: str
