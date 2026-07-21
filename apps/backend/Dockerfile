# syntax=docker/dockerfile:1.7

# Install main deps — shared cache layer between dev and prod
FROM ghcr.io/astral-sh/uv:0.4-python3.12-bookworm-slim AS uv-base
WORKDIR /app
COPY apps/backend/pyproject.toml apps/backend/uv.lock apps/backend/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project

# Dev stage — src/ and migrations/ are volume-mounted by docker-compose for hot reload
FROM uv-base AS dev
RUN uv sync --extra dev --frozen
ENV PYTHONPATH=/app/src
EXPOSE 8000
# Run migrations before starting the server so the schema is always up to date
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn revolt_api.main:app --host 0.0.0.0 --port 8000 --reload"]

# Prod stage — src/ and migrations baked in; run migrations separately in CI/CD before deploy
FROM ghcr.io/astral-sh/uv:0.4-python3.12-bookworm-slim AS prod
WORKDIR /app
COPY --from=uv-base /app/.venv /app/.venv
COPY apps/backend/pyproject.toml ./
COPY apps/backend/src ./src
COPY apps/backend/migrations ./migrations
COPY apps/backend/alembic.ini ./
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app/src
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "revolt_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
