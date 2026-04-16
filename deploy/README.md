# Deploy

This directory contains deployment assets for two distinct use cases:

- contributor-friendly local development;
- production-oriented container deployment examples.

Keeping those concerns separate makes the repository easier to understand and avoids presenting a local-only stack as a production recommendation.

## Contents

| File | Description |
|---|---|
| `docker-compose.dev.yml` | Local development stack: PostgreSQL, Valkey, MinIO, and optional app containers |
| `docker-compose.prod.yml` | Production-oriented single-host stack: web, API, PostgreSQL, Valkey, and MinIO |
| `docker-compose.e2e.yml` | End-to-end test stack mirroring production topology with fixed test credentials |
| `.env.production.example` | Example environment file for `docker-compose.prod.yml` |

Service container definitions live with each service:
- [`services/api/Dockerfile`](../services/api/Dockerfile)
- [`apps/web/Dockerfile`](../apps/web/Dockerfile)

## Development Compose

Use [`docker-compose.dev.yml`](./docker-compose.dev.yml) for local development and contributor onboarding.

Start the full local stack in containers:

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```

Start only shared dependencies:

```bash
docker compose -f deploy/docker-compose.dev.yml up -d postgres valkey
```

For day-to-day coding, contributors can still run the application services directly on the host and use Docker Compose only for PostgreSQL and Valkey.

The Postgres schema is applied automatically on the first container start from `services/api/migrations/`.

### Development service ports

| Service | Port | Notes |
|---|---|---|
| PostgreSQL | 5432 | Local database for development |
| Valkey | 6379 | Local cache / event streams |
| API | 8080 | Containerized Go service |
| Web | 3000 | Containerized React app |
| MinIO S3 API | 9000 | Local object store (S3-compatible) |
| MinIO Console | 9001 | MinIO web UI (credentials: `minioadmin` / `minioadmin`) |

Stop the development stack:

```bash
docker compose -f deploy/docker-compose.dev.yml down
```

Remove the Postgres volume as well:

```bash
docker compose -f deploy/docker-compose.dev.yml down -v
```

## Production Compose

Use [`docker-compose.prod.yml`](./docker-compose.prod.yml) as a self-hosting baseline for open-source deployments.

The production compose includes PostgreSQL and Valkey because a public repository should offer a runnable end-to-end deployment path. It is still a single-host baseline rather than a universal recommendation. Teams using managed services can keep the same application images and point the runtime configuration at external infrastructure instead.

Create a production environment file from the example:

```bash
cp deploy/.env.production.example deploy/.env.production
```

Then run:

**With MinIO (default self-hosted):**
```bash
docker compose \
  --env-file deploy/.env.production \
  -f deploy/docker-compose.prod.yml up -d --build
```

**With AWS S3 (suppress MinIO):**
```bash
# Set STORAGE_PROVIDER=s3 and real AWS credentials in .env.production
docker compose \
  --env-file deploy/.env.production \
  -f deploy/docker-compose.prod.yml up -d --build --scale minio=0
```

This file is suitable as:

- a self-hosting starting point;
- a CI/CD handoff artifact;
- a reference for container image names and required runtime configuration.

By default, the web and API services are published to the host in the production compose. PostgreSQL, Valkey, and MinIO stay on the internal Compose network unless an operator intentionally exposes them.

## E2E Compose

Use [`docker-compose.e2e.yml`](./docker-compose.e2e.yml) to spin up a full production-like stack with fixed, test-safe credentials for running end-to-end tests:

```bash
docker compose -f deploy/docker-compose.e2e.yml up -d --build --wait
docker compose -f deploy/docker-compose.e2e.yml down -v
```

All secrets are intentionally weak and public — never use them outside a local E2E environment.

## Object Storage

All environments include MinIO, an S3-compatible object store, to support file attachments without requiring an AWS account.

In production, MinIO runs by default. When using AWS S3, pass `--scale minio=0` to suppress the MinIO container:

```bash
docker compose --env-file deploy/.env.production \
  -f deploy/docker-compose.prod.yml up -d --build --scale minio=0
```

To switch to AWS S3:
1. Set `STORAGE_PROVIDER=s3` in `.env.production`.
2. Leave `STORAGE_ENDPOINT` empty (uses the default AWS regional endpoint) or set it explicitly.
3. Supply real `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY`.
4. Add `--scale minio=0` to the startup command.