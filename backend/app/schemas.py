"""Pydantic request/response models for the API."""
from typing import Any, Optional

from pydantic import BaseModel


class ResolveRequest(BaseModel):
    query: str


class ClusterRequest(BaseModel):
    paperIds: list[str]
    edges: list[dict] = []
    summarize: bool = False


class LineageRequest(BaseModel):
    sourceId: str
    targetId: str
    edges: list[dict] = []


class SimilarRequest(BaseModel):
    paperId: str
    paperIds: list[str]
    topK: Optional[int] = None


class ExplainRequest(BaseModel):
    paperId: str


class LandscapeRequest(BaseModel):
    paperIds: list[str]
    edges: list[dict] = []


class ConfigResponse(BaseModel):
    llm_enabled: bool
    s2_key_present: bool
    default_seed: str
