# Contributing

Thanks for helping improve SpaceRead. This repo contains the React web client and Go backend services for the student resource and professor review platform.

## Project Layout

- `web-client/`: Vite, React, TypeScript, Sass frontend.
- `services/`: Go backend services.
- `services/cmd/course`: course API entrypoint.
- `services/cmd/professor`: professor API entrypoint.
- `services/migrations/`: versioned database migrations.

## Local Setup

Use the versions expected by the project:

- Node.js `22.18.0`
- npm `10.7.0` or newer
- Go `1.23.x`

Install frontend dependencies from `web-client/`:

```powershell
cd web-client
npm install
```

Download backend dependencies from `services/`:

```powershell
cd services
go mod download
```

Environment files are required for most runtime flows. Do not commit real production secrets. Prefer local-only values for development and rotate any token that is accidentally shared.

## Docker Compose Workflow

The root `docker-compose.yaml` starts a disposable local stack:

```powershell
docker compose up --build
```

It exposes:

- Web client: `http://localhost:5173`
- Admin client: `http://localhost:5174`
- Course API: `http://localhost:8081`
- Professor API: `http://localhost:8082`
- Account API: `http://localhost:8083`
- Admin API: `http://localhost:8084`
- Postgres: `localhost:5432`

Compose runs the database migrations before starting the APIs. The default database credentials are local-only: database `spaceread`, user `spaceread`, password `spaceread`.

The professor service uses `RECAPTCHA_BYPASS=true` in Compose so it can boot without Google Cloud credentials. This is for local development only. Uploads, translation, email delivery, and other third-party integrations still need real provider credentials if you want to exercise those paths.

## Frontend Workflow

Run the dev server:

```powershell
cd web-client
npm run dev
```

Before opening a PR or merging a frontend change, run:

```powershell
cd web-client
npm run lint
npm run build
```

If the global npm shim is broken on Windows, the repo-local binaries can still verify the app:

```powershell
cd web-client
.\node_modules\.bin\tsc.cmd
.\node_modules\.bin\vite.cmd build
```

## Backend Workflow

Run backend checks from `services/`:

```powershell
cd services
go test ./...
```

Run a service locally after configuring its environment:

```powershell
cd services
go run ./cmd/professor
go run ./cmd/course
```

Use `gofmt` on changed Go files before submitting:

```powershell
gofmt -w path\to\file.go
```

## Database Migrations

Database migrations live in `services/migrations/` and are run through the Go helper in `services/cmd/migrate`.

For a local database, set either `DATABASE_URL` or the existing `DB_*` environment variables. Local Postgres usually needs `DB_SSLMODE=disable`.

Create a migration pair:

```powershell
cd services
go run ./cmd/migrate create add_review_indexes
```

Apply pending migrations:

```powershell
cd services
go run ./cmd/migrate up
```

Roll back one migration:

```powershell
cd services
go run ./cmd/migrate down 1
```

Check the current version:

```powershell
cd services
go run ./cmd/migrate version
```

The first migration is a baseline for the schema the code already expects. For an existing shared database that already has this schema, verify it first and mark the baseline as applied with:

```powershell
cd services
go run ./cmd/migrate force 1
```

After the baseline, every schema change should include an `.up.sql` file and a matching `.down.sql` file in the same PR as the code that depends on it.

## Code Style

- Follow existing patterns in the area you are editing.
- Keep changes focused; avoid unrelated refactors in the same change.
- Prefer typed data handling over ad hoc string manipulation.
- Keep user-facing UI states resilient to missing API fields and failed third-party requests.
- Do not add secrets, API tokens, private keys, or production credentials to commits, logs, screenshots, or issues.

## Pull Requests

Good PRs should include:

- A short description of the problem and fix.
- Screenshots or notes for visible UI changes.
- The commands you ran to verify the change.
- Any remaining risk, follow-up work, or production rollout notes.
