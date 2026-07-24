#!/usr/bin/env bash
#
# Generates API reference documentation from source: TypeDoc for the
# shared-types contracts and frontend lib/hooks, pdoc for the backend
# Python package. Output is written to api-docs/ (gitignored, regenerate
# on demand any time) at the repo root.
#
# Usage:
#   ./docs.sh
#   ./docs.sh --frontend
#   ./docs.sh --backend
#   ./docs.sh --open
#
# Flags:
#   --frontend   Generate only the frontend docs (TypeDoc: shared-types
#                plus apps/frontend/src/lib and hooks).
#   --backend    Generate only the backend docs (pdoc: revolt_api).
#   --open       Open the generated docs in the default browser afterward.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_DIR="${ROOT}/apps/backend"
OUT_DIR="${ROOT}/api-docs"

RUN_FE=true
RUN_BE=true
OPEN=false

for arg in "$@"; do
  case "${arg}" in
    --frontend) RUN_BE=false ;;
    --backend)  RUN_FE=false ;;
    --open)     OPEN=true ;;
    *)
      echo "Unknown argument: ${arg}"
      echo "Usage: $0 [--frontend] [--backend] [--open]"
      exit 1
      ;;
  esac
done

PASS=0
FAIL=0

# Prints a clickable OSC 8 terminal hyperlink (supported by VS Code's terminal,
# iTerm2, GNOME Terminal, Kitty, etc.); terminals without support just show the
# label text, so this is safe everywhere. Note: VS Code's own terminal always
# intercepts file:// clicks and opens them in its editor, not a browser -- use
# --open instead of clicking there.
print_link() {
  local uri="$1"
  local label="$2"
  printf '  \033]8;;%s\033\\%s\033]8;;\033\\\n' "${uri}" "${label}"
}

# Opens a local file in the OS default browser, not VS Code's own editor
# (`code` itself has no reliable "open externally" flag; it just opens the
# path as a new window, which is worse than the problem this is solving).
open_in_browser() {
  local target="$1"
  if command -v xdg-open >/dev/null 2>&1 && xdg-open "${target}" >/dev/null 2>&1; then
    return
  fi
  if command -v wslview >/dev/null 2>&1 && wslview "${target}" >/dev/null 2>&1; then
    return
  fi
  if command -v open >/dev/null 2>&1 && open "${target}" >/dev/null 2>&1; then
    return
  fi
  echo "Could not open ${target} automatically; open it manually."
}

# Generates TypeDoc HTML for shared-types and for frontend lib/hooks.
# Two separate invocations because each has its own tsconfig (shared-types
# is its own package; lib/hooks are part of the frontend app's project).
run_frontend() {
  echo ""
  echo "=== Frontend (TypeDoc) ==="

  local ok=true

  if ! (cd "${ROOT}" && pnpm exec typedoc \
    --entryPoints packages/shared-types/src/index.ts \
    --tsconfig packages/shared-types/tsconfig.json \
    --out "${OUT_DIR}/frontend/shared-types" \
    --name "Revolt GUI - shared-types"); then
    ok=false
  fi

  local entry_files
  mapfile -t entry_files < <(
    find "${ROOT}/apps/frontend/src/lib" "${ROOT}/apps/frontend/src/hooks" \
      -maxdepth 1 -name "*.ts" ! -name "*.test.ts" | sort
  )
  if ! (cd "${ROOT}" && pnpm exec typedoc \
    --entryPoints "${entry_files[@]}" \
    --tsconfig apps/frontend/tsconfig.app.json \
    --out "${OUT_DIR}/frontend/app" \
    --name "Revolt GUI - frontend lib & hooks"); then
    ok=false
  fi

  if ${ok}; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

# Generates pdoc HTML for the revolt_api package.
run_backend() {
  echo ""
  echo "=== Backend (pdoc) ==="

  if (cd "${BE_DIR}" && uv run pdoc revolt_api --docformat google -o "${OUT_DIR}/backend"); then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

${RUN_FE} && run_frontend
${RUN_BE} && run_backend

echo ""

if [[ "${FAIL}" -eq 0 ]]; then
  echo "All docs generated (${PASS}/$((PASS + FAIL))):"
  if ${RUN_FE}; then
    print_link "file://${OUT_DIR}/frontend/shared-types/index.html" "Frontend - shared-types"
    print_link "file://${OUT_DIR}/frontend/app/index.html" "Frontend - lib & hooks"
  fi
  if ${RUN_BE}; then
    print_link "file://${OUT_DIR}/backend/index.html" "Backend - revolt_api"
  fi
  if ${OPEN}; then
    if ${RUN_FE}; then
      open_in_browser "${OUT_DIR}/frontend/shared-types/index.html"
      open_in_browser "${OUT_DIR}/frontend/app/index.html"
    fi
    if ${RUN_BE}; then
      open_in_browser "${OUT_DIR}/backend/index.html"
    fi
  fi
else
  echo "${FAIL} generation(s) failed"
  exit 1
fi
