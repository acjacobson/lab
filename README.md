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

This repository builds a portable web application container. The app can be deployed anywhere that can build and run the Docker image.

For a local Docker Compose example, see `deploy/compose.example.yml`.

For the current production-style VM workflow, this repository deploys itself after CI passes on pushes to `main`. The VM must already be provisioned with Docker, a `deploy` user, the external `web` Docker network, and a Traefik proxy. Host provisioning is intentionally handled outside this application repository.

Required repository secrets for automatic deployment:

```text
DEPLOY_HOST
DEPLOY_USER
DEPLOY_SSH_KEY
DEPLOY_APP_DIR
LAB_HOSTNAME
```

Optional external smoke-test secret:

```text
DEPLOY_URL
```
