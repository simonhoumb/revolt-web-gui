# syntax=docker/dockerfile:1.7

# Install deps — shared cache layer between dev and prod
FROM ghcr.io/astral-sh/uv:0.4-python3.12-bookworm-slim AS uv-base
WORKDIR /app
COPY apps/backend/pyproject.toml apps/backend/uv.lock apps/backend/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project

# Dev stage — src/ is volume-mounted by docker-compose for hot reload
FROM uv-base AS dev
RUN uv sync --frozen
ENV PYTHONPATH=/app/src
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "revolt_api.main:app", \
    "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Prod stage — minimal image, src/ copied in Feature 3
FROM ghcr.io/astral-sh/uv:0.4-python3.12-bookworm-slim AS prod
WORKDIR /app
COPY --from=uv-base /app/.venv /app/.venv
COPY apps/backend/pyproject.toml ./
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app/src
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "revolt_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
