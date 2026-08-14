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

### Where things live

- **Frontend**: state lives in `src/context/` with one provider per change-reason (session, live bridge data, layout, mission CRUD, chart settings). The dashboard is a grid of tiles defined in `src/components/widgets/registry.ts`; each widget is one component + one CSS module. Shared helpers live in `src/lib/`, data-fetching/subscription logic in `src/hooks/`.
- **Backend**: `routers/` are thin HTTP boundaries (parse request, fetch or 404, delegate) that hand off to `services/` for actual command orchestration. `bridge/` owns the ROS2 WebSocket connection and message transforms. `models/` are the SQLAlchemy ORM tables, `schemas/` are the Pydantic API shapes.

## Getting started

### Prerequisites

- [Docker](https://docs.docker.com/engine/install/) and Docker Compose
- [Node.js 20](https://nodejs.org/), then enable pnpm via corepack (matches the version pinned in `package.json` and used in CI): `corepack enable && corepack prepare pnpm@9.15.9 --activate`
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager)

Both pnpm and uv install to `~/.local/bin` on a fresh Ubuntu account, which usually isn't on `PATH` by default, see Troubleshooting below if either command isn't found after installing.

### Editor setup [Optional]

Open the repo folder in VS Code and accept the "install recommended extensions" prompt (`.vscode/extensions.json`: ESLint, Prettier, Ruff, Python). Format-on-save is already configured. The Python interpreter is pinned to `apps/backend/.venv/bin/python`, so run the Python install step below before VS Code can resolve backend imports.

### First-time setup

```bash
# 1. Copy environment file and fill in any values you want to change
cp .env.example .env

# 2. Install Node dependencies and generate lockfile
pnpm install

# 3. Install Python dependencies (--extra dev pulls in ruff/pytest, used below)
cd apps/backend && uv sync --extra dev && cd ../..
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

The `.env` you just copied defaults to `VESSEL_HOST=rosbridge-mock`, but that container only starts with `--profile mock`, so plain `docker compose up` on its own has nothing to connect to yet. Pick whichever of these matches your setup:

```bash
# Mock bridge: no vessel needed, fake sensor data
docker compose --profile mock up

# Physical vessel on the same LAN or Wi-Fi (e.g. connected to the vessel's own network):
# .env: VESSEL_HOST=<vessel IP address>, BRIDGE_TARGET=physical
docker compose up

# Physical vessel over Tailscale, see Networking (Tailscale) below
docker compose --profile vessel up
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

This section only applies if you're using the Tailscale connection mode mentioned above, e.g. because your laptop isn't on the same LAN/Wi-Fi as the vessel. If you're on the same network as the vessel, use the LAN mode instead and skip this section.

If Tailscale is the mode you're using, the backend reaches the physical vessel over it via a small `vessel-proxy` sidecar, not by joining the tailnet directly from the backend container. `network_mode: "service:tailscale"` on the backend itself breaks Docker's internal DNS (`db` would become unreachable).

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

See [.env.example](.env.example) for all required variables. Never commit `.env`. For day-to-day local development you can ignore most of it: the database vars, plus whichever one of the three `VESSEL_HOST`/`BRIDGE_TARGET` pairs from Running locally above matches how you're connecting. The Tailscale-specific vars (`TAILSCALE_AUTHKEY`, `TS_HOSTNAME`) only matter for the Tailscale connection mode — see Networking above.

### Troubleshooting

- **`pnpm`/`uv`: command not found**: both install to `~/.local/bin` rather than system-wide on some setups. If the shell can't find them, run `export PATH="$HOME/.local/bin:$PATH"`.
- **pytest fails on startup with a `PYTHONPATH` or launch_pytest error**: if ROS2 is sourced in the shell (e.g. `source /opt/ros/.../setup.bash` in your `.bashrc`), its `PYTHONPATH` leaks into the backend's Python environment and conflicts with pytest. Clear it before running: `PYTHONPATH="" uv run pytest`. `test.sh` already does this for you.
- **`docker compose up` fails with "permission denied" / "Cannot connect to the Docker daemon"**: a fresh Ubuntu account usually isn't in the `docker` group yet. Follow Docker's [post-install steps for Linux](https://docs.docker.com/engine/install/linux-postinstall/), then log out and back in.
- **A port is already in use (5173/8000/5432/3000)**: usually a `docker compose` stack left running from an earlier session. Run `docker compose down` and try again.

## Contributing

- Branches are named `summer/<year>/<type>/<short-description>` and always cut from `dev`, never `main`.
- Open PRs against `dev`; `dev` → `main` happens separately at meaningful milestones.
- Commit messages use a type prefix: `feat`, `fix`, `chore`, `ci`, `docs`, `build`, `perf`, `refactor`, `revert`, `style`, `test` (e.g. `fix: correct GNSS heading offset`).

PR template: `.azuredevops/pull_request_template.md`.

## CI/CD

The pipeline (`azure-pipelines.yml`) runs a `ci` stage on every PR into `dev` or `main`: frontend (typecheck, lint, format check, tests, build) and backend (Ruff lint/format, pytest, Docker build) jobs run in parallel and gate merging. Push/deploy stages also exist in the pipeline but are inactive (`AZURE_READY: "false"`) until Azure infrastructure is provisioned.

See the project's Azure DevOps wiki for deployment and infrastructure setup details.
