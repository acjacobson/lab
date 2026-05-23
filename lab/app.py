from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from lab import __version__

APP_NAME = os.getenv("APP_NAME", "lab")
BUILD_SHA = os.getenv("BUILD_SHA", "dev")
BUILD_TIME = os.getenv("BUILD_TIME", "unknown")

app = FastAPI(title="Lab", version=__version__)
app.mount("/static", StaticFiles(directory="lab/static"), name="static")
templates = Jinja2Templates(directory="lab/templates")


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {"app_name": APP_NAME, "version": __version__, "build_sha": BUILD_SHA},
    )


@app.get("/blog", response_class=HTMLResponse)
def blog(request: Request):
    return templates.TemplateResponse(request, "blog.html", {"app_name": APP_NAME})


@app.get("/healthz")
def healthz():
    return {"status": "ok", "app": APP_NAME}


@app.get("/version")
def version():
    return {
        "app": APP_NAME,
        "version": __version__,
        "build_sha": BUILD_SHA,
        "build_time": BUILD_TIME,
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
