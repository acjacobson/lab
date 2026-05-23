# Architecture

Lab is a small FastAPI application.

## Runtime

- FastAPI serves HTTP routes.
- Jinja2 renders HTML templates.
- Static assets are served from `lab/static`.
- `/healthz` provides a smoke-testable health endpoint.
- `/version` exposes build metadata supplied through environment variables.

## Deployment portability

The app can run directly with Uvicorn or inside a container. It does not require a specific cloud provider, VM layout, reverse proxy, or platform.
