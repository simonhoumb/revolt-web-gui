# Revolt GUI

Web-based GUI for monitoring and controlling the Revolt autonomous surface vessel. Provides real-time sensor feeds, map visualization, trajectory planning, and mission control over a ROS2 bridge.

## Stack

| Layer            | Technology                                            |
| ---------------- | ----------------------------------------------------- |
| Frontend         | React 18 + TypeScript, Vite, OpenBridge Design System |
| Backend          | FastAPI (Python 3.12), SQLAlchemy 2, Alembic          |
| Database         | PostgreSQL 16 + PostGIS 3.4                           |
| Real-time        | WebSocket gateway (rosbridge_suite)                   |
| Map              | MapLibre GL JS + TileServer GL / martin               |
| Containers       | Docker Compose                                        |
| Package managers | pnpm 9 (Node), uv (Python)                            |

## Monorepo structure

```
WebApp/
├── apps/
│   ├── frontend/        React + Vite app (@revolt/frontend)
│   └── backend/         FastAPI service (revolt-api)
├── packages/
│   └── shared-types/    Shared TypeScript types (@revolt/shared-types)
├── infra/
│   ├── db/init/         SQL init scripts (PostGIS extension)
│   ├── rosbridge_mock/  Mock ROS2 bridge for local dev without a vessel
│   ├── enc-pipeline/    ENC chart data -> vector tiles + PostGIS ingestion
│   └── martin/          Vector tile server config and fonts
├── test.sh               Run test suites
├── lint.sh               Run linters/formatters
├── docs.sh               Generate API reference docs
├── docker-compose.yml
└── .env.example
```

## Getting started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js 20](https://nodejs.org/) + pnpm (`npm install -g pnpm@9`)
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager)

### First-time setup

```bash
# 1. Copy environment file and fill in any values you want to change
cp .env.example .env

# 2. Install Node dependencies and generate lockfile
pnpm install

# 3. Install Python dependencies
cd apps/backend && uv sync && cd ../..
```

### Running locally

```bash
# Start everything (DB + backend + frontend)
docker compose up

# Or start only the database (useful while developing the backend directly)
docker compose up db

# Apply the DB schema (first time, and after pulling new migrations)
cd apps/backend && uv run alembic upgrade head && cd ../..
```

By default the backend expects a real vessel or simulation to connect to over Tailscale. To get realistic sensor data flowing without either, start the mock bridge instead and point `.env` at it:

```bash
docker compose --profile mock up
# .env: VESSEL_HOST=rosbridge-mock, BRIDGE_TARGET=physical
```

| Service             | URL                            |
| ------------------- | ------------------------------ |
| Frontend            | http://localhost:5173          |
| Backend API         | http://localhost:8000          |
| API docs (dev only) | http://localhost:8000/api/docs |
| Map tiles (martin)  | http://localhost:3000/tiles    |
| PostgreSQL          | localhost:5432                 |

### Running without Docker

```bash
# Terminal 1: backend
cd apps/backend
uv run uvicorn revolt_api.main:app --reload --port 8000

# Terminal 2: frontend
pnpm dev
```

## Development

### Useful commands

```bash
./lint.sh                  # Lint + format check (frontend + backend)
./lint.sh --fix            # Auto-fix lint issues and write formatting

./test.sh                  # Frontend + backend unit tests
./test.sh --coverage       # ...with coverage reporting
./test.sh --integration    # Backend integration tests (needs a running DB, see below)

./docs.sh                  # Generate API reference docs (TypeDoc + pdoc) into api-docs/
./docs.sh --open           # ...and open them in your browser
```

Each script also takes `--frontend`/`--backend` to scope to one side, and mirrors what the CI pipeline runs. See each script's own header comment for the full flag list.

### Testing

`./test.sh` runs the frontend Vitest suite and the backend pytest unit suite (no DB required). Backend integration tests need a real PostgreSQL/PostGIS database with the schema applied:

```bash
docker compose up -d db
cd apps/backend && uv run alembic upgrade head && cd ../..
./test.sh --integration
```

### Networking (Tailscale)

The backend reaches the physical vessel over Tailscale via a small `vessel-proxy` sidecar, not by joining the tailnet directly from the backend container. `network_mode: "service:tailscale"` on the backend itself breaks Docker's internal DNS (`db` would become unreachable).

**To connect to the vessel:**

1. Generate an ephemeral auth key at [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys) (use _ephemeral_ so the node is removed when the container stops)
2. Add it to your `.env`:
    ```
    TAILSCALE_AUTHKEY=tskey-auth-...
    VESSEL_HOST=vessel-proxy
    BRIDGE_TARGET=physical
    ```
3. Run `docker compose --profile vessel up`; the `tailscale` and `vessel-proxy` sidecars join the tailnet and expose the vessel's rosbridge port to the rest of the compose network as `vessel-proxy:9090`.

See [.env.example](.env.example) for the mock, physical-vessel, and simulation connection modes.

### Environment variables

See [.env.example](.env.example) for all required variables. Never commit `.env`.

### Troubleshooting

- **`pnpm`/`uv`: command not found**: both install to `~/.local/bin` rather than system-wide on some setups. If the shell can't find them, run `export PATH="$HOME/.local/bin:$PATH"`.
- **pytest fails on startup with a `PYTHONPATH` or launch_pytest error**: if ROS2 is sourced in the shell (e.g. `source /opt/ros/.../setup.bash` in your `.bashrc`), its `PYTHONPATH` leaks into the backend's Python environment and conflicts with pytest. Clear it before running: `PYTHONPATH="" uv run pytest`. `test.sh` already does this for you.

## Contributing

- Branches are named `summer/<year>/<type>/<short-description>` and always cut from `dev`, never `main`.
- Open PRs against `dev`; `dev` → `main` happens separately at meaningful milestones.
- Commit messages use a type prefix: `feat`, `fix`, `chore`, `ci`, `docs`, `build`, `perf`, `refactor`, `revert`, `style`, `test` (e.g. `fix: correct GNSS heading offset`).

PR template: `.azuredevops/pull_request_template.md`.

## CI/CD

The pipeline (`azure-pipelines.yml`) runs a `ci` stage on every PR into `dev` or `main`: frontend (typecheck, lint, format check, tests, build) and backend (Ruff lint/format, pytest, Docker build) jobs run in parallel and gate merging. Push/deploy stages also exist in the pipeline but are inactive (`AZURE_READY: "false"`) until Azure infrastructure is provisioned.

See the project's Azure DevOps wiki for deployment and infrastructure setup details.
