"""Central configuration loaded from environment / .env file."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

# Load backend/.env (no-op if missing). Keys are optional.
load_dotenv(BACKEND_DIR / ".env")

# --- API keys (both optional) ---
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
S2_API_KEY = os.getenv("S2_API_KEY", "").strip()

# --- Semantic Scholar ---
S2_BASE_URL = "https://api.semanticscholar.org/graph/v1"
# Throttle: <= 1 req/s without a key. A key raises throughput.
S2_RATE_LIMIT_PER_SEC = 5.0 if S2_API_KEY else 1.0
S2_MAX_RETRIES = 5
S2_BACKOFF_BASE = 1.0  # seconds; doubles each retry on 429 / 5xx
S2_TIMEOUT = 30.0

# Fields requested from the /paper/batch endpoint.
PAPER_FIELDS = (
    "title,abstract,year,authors,citationCount,influentialCitationCount,"
    "externalIds,tldr,embedding.specter_v2,url"
)

# --- Graph expansion caps ---
MAX_REFERENCES = 25
MAX_CITATIONS = 25

# --- Claude ---
ANTHROPIC_MODEL = "claude-sonnet-4-6"
LLM_ENABLED = bool(ANTHROPIC_API_KEY)

# --- Storage ---
DB_PATH = BACKEND_DIR / "cache.db"

# --- Frontend (built) ---
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"
