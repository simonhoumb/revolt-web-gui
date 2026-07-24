#!/usr/bin/env bash
#
# Runs the project's linters and style formatters.
#
# By default, this script checks both the frontend and backend without
# writing any changes (ESLint + Prettier --check for frontend, Ruff check +
# Ruff format --check for backend) -- the same checks the CI lint stage runs.
# Pass --fix to auto-fix lint issues and write formatting changes instead.
#
# Usage:
#   ./lint.sh
#   ./lint.sh --frontend
#   ./lint.sh --backend
#   ./lint.sh --fix
#
# Flags:
#   --frontend   Run only frontend checks.
#   --backend    Run only backend checks.
#   --fix        Auto-fix lint issues and write formatting changes instead of
#                checking only.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_DIR="${ROOT}/apps/backend"

RUN_FE=true
RUN_BE=true
FIX=false

for arg in "$@"; do
  case "${arg}" in
    --frontend) RUN_BE=false ;;
    --backend)  RUN_FE=false ;;
    --fix)      FIX=true ;;
    *)
      echo "Unknown argument: ${arg}"
      echo "Usage: $0 [--frontend] [--backend] [--fix]"
      exit 1
      ;;
  esac
done

PASS=0
FAIL=0

# Runs ESLint and Prettier over the frontend/shared-types workspace.
run_frontend() {
  echo ""
  echo "=== Frontend (eslint + prettier) ==="

  if ${FIX}; then
    if (cd "${ROOT}" && pnpm lint:fix && pnpm format); then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
    fi
  else
    if (cd "${ROOT}" && pnpm lint && pnpm format:check); then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
    fi
  fi
}

# Runs Ruff lint and format over the backend.
run_backend() {
  echo ""
  echo "=== Backend (ruff) ==="

  if ${FIX}; then
    if (cd "${BE_DIR}" && uv run ruff check --fix . && uv run ruff format .); then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
    fi
  else
    if (cd "${BE_DIR}" && uv run ruff check . && uv run ruff format --check .); then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
    fi
  fi
}

${RUN_FE} && run_frontend
${RUN_BE} && run_backend

echo ""

if [[ "${FAIL}" -eq 0 ]]; then
  echo "All checks passed (${PASS}/$((PASS + FAIL)))"
else
  echo "${FAIL} check(s) failed"
  exit 1
fi
