# HMS Revamp

## Prerequisites

- Node.js 18+
- Docker & Docker Compose

## Local Development Setup

### 1. Start infrastructure services

```bash
docker compose up -d
```

This starts:

| Service | Purpose | URL |
|---------|---------|-----|
| **PostgreSQL** | Database | `localhost:5432` |
| **MinIO** | S3-compatible file storage | Console: http://localhost:9001 |
| **Mailpit** | SMTP mail catcher | Web UI: http://localhost:8025 |

MinIO credentials: `minioadmin` / `minioadmin`

### 2. Configure environment

```bash
cp .env.example .env
```

The defaults in `.env.example` are pre-configured to work with the docker compose services — no changes needed for local dev.

### 3. Install dependencies and set up database

```bash
npm install
npx prisma migrate dev
npx prisma db seed
```

### 4. Start the dev server

```bash
npm run dev
```

App runs at http://localhost:3000.

## Dev Tools

### MinIO (Mock S3)

- **Console**: http://localhost:9001 — browse uploaded files, manage buckets
- **API endpoint**: http://localhost:9000 — used by the app via `S3_ENDPOINT` env var
- Bucket `hms-uploads` is auto-created on first `docker compose up`

### Mailpit (Mock Email)

- **Web UI**: http://localhost:8025 — view all emails sent by the app
- **SMTP**: `localhost:1025` — no authentication required
- All outgoing emails in development are caught here instead of being delivered

### Useful commands

```bash
# View logs
docker compose logs -f mailpit
docker compose logs -f minio

# Reset MinIO storage
docker compose down -v minio
docker compose up -d minio minio-setup

# Run mock seed (comprehensive test data)
npx tsx prisma/seed-mock.ts
```
