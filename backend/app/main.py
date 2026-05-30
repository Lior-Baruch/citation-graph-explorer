"""FastAPI entrypoint. Wires routes, CORS for the Vite dev server, and (when
present) serves the built frontend so the whole app runs on one port.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, db, s2_client
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield
    await s2_client.close_client()


app = FastAPI(title="Citation Graph Explorer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# Serve the built frontend if it exists (production / single-port mode).
if config.FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=config.FRONTEND_DIST / "assets"),
        name="assets",
    )

    @app.get("/")
    async def index():
        return FileResponse(config.FRONTEND_DIST / "index.html")
