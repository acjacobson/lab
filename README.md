# Lab

Lab is a small FastAPI web application for exercising application development, testing, container builds, and deployment workflows.

The first version serves mostly static pages, but it is structured as a normal web application so it can grow into a dynamic service later.

## Requirements

- Python 3.11+
- Docker, for container builds and containerized runs
- curl, for smoke checks

## Local development

```bash
git clone https://github.com/example/lab.git
cd lab
./scripts/setup.sh
./scripts/test.sh
./scripts/run.sh
```

Open <http://127.0.0.1:8080>.

## Useful commands

```bash
./scripts/test.sh
./scripts/build.sh
BASE_URL=http://127.0.0.1:8080 ./scripts/smoke.sh
```

## Configuration

Copy `.env.example` if you need local environment overrides. Do not commit real `.env` files.

## Deployment

This repository builds a portable web application container. It intentionally does not assume a specific production host.

For a Docker Compose example, see `deploy/compose.example.yml`. Host-level routing, shared reverse proxies, VM users, firewall rules, and production paths should live in the infrastructure repository for the environment that runs the app.

On pushes to `main`, the `Deploy` workflow runs after CI passes and triggers the external host repository deployment workflow. This keeps host-specific deployment logic out of this application repository while still allowing application commits to initiate deployment.

To enable automatic deployment, add this repository secret:

```text
APPHOST_DISPATCH_TOKEN
```

The token must be able to run workflows in the host repository. If the secret is not set, the workflow logs a skip message and exits successfully.
