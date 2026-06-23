# Revolt GUI

Web-based GUI for monitoring and controlling the Revolt autonomous surface vessel. Provides real-time sensor feeds, map visualization, trajectory planning, and mission control over a ROS2 bridge.

## Stack

| Layer            | Technology                                            |
| ---------------- | ----------------------------------------------------- |
| Frontend         | React 18 + TypeScript, Vite, OpenBridge Design System |
| Backend          | FastAPI (Python 3.12), SQLAlchemy 2, Alembic          |
| Database         | PostgreSQL 16 + PostGIS 3.4                           |
| Real-time        | WebSocket gateway (rosbridge or custom rclpy node)    |
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
│   └── db/init/         SQL init scripts (PostGIS extension)
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
```

| Service             | URL                            |
| ------------------- | ------------------------------ |
| Frontend            | http://localhost:5173          |
| Backend API         | http://localhost:8000          |
| API docs (dev only) | http://localhost:8000/api/docs |
| PostgreSQL          | localhost:5432                 |

### Running without Docker

```bash
# Terminal 1 — backend
cd apps/backend
uv run uvicorn revolt_api.main:app --reload --port 8000

# Terminal 2 — frontend
pnpm dev
```

## Development

### Useful commands

```bash
pnpm typecheck       # TypeScript check across the whole workspace
pnpm lint            # ESLint
pnpm lint:fix        # ESLint with auto-fix
pnpm format          # Prettier
pnpm format:check    # Prettier check (no writes)

cd apps/backend
uv run ruff check .  # Python lint
uv run ruff format . # Python format
```

### Networking (Tailscale)

The backend reaches the vessel over Tailscale. A Tailscale sidecar container runs alongside the backend and joins the existing tailnet — no Tailscale installation on the host is needed.

**To connect to the vessel:**

1. Generate an ephemeral auth key at [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys) (use *ephemeral* so the node is removed when the container stops)
2. Add it to your `.env`:
   ```
   TAILSCALE_AUTHKEY=tskey-auth-...
   VESSEL_HOST=revolt-onboard
   ROS2_BRIDGE_PORT=9090
   ```
3. Run `docker compose up` — the sidecar joins the tailnet automatically and the backend resolves `revolt-onboard` whether you are on local WiFi or remote 5G. No code changes needed either way.

Leave `TAILSCALE_AUTHKEY` empty to run without joining the tailnet (local development without the vessel).

### Environment variables

See [.env.example](.env.example) for all required variables. Never commit `.env`.
