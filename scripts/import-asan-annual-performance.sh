#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

LOCK_DIR="${ASAN_PERFORMANCE_LOCK_DIR:-/tmp/els-asan-annual-performance-sync.lock}"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[asan-annual-performance] another sync is already running; skipped"
  exit 0
fi
trap 'rmdir "$LOCK_DIR"' EXIT

FILE_PATH="${ASAN_ANNUAL_PERFORMANCE_FILE:-/volume2/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx}"
NODE_BIN="${NODE_BIN:-node}"
CHUNK_SIZE="${ASAN_PERFORMANCE_CHUNK_SIZE:-100}"
NICE_LEVEL="${ASAN_PERFORMANCE_NICE:-10}"
IONICE_CLASS="${ASAN_PERFORMANCE_IONICE_CLASS:-2}"
IONICE_LEVEL="${ASAN_PERFORMANCE_IONICE_LEVEL:-7}"

COMMAND=(
  "$NODE_BIN"
  web/scripts/import-asan-annual-performance.mjs
  --file "$FILE_PATH"
  --chunk-size "$CHUNK_SIZE"
  --confirm-large-import
  "$@"
)

echo "[asan-annual-performance] start $(date '+%Y-%m-%d %H:%M:%S')"
echo "[asan-annual-performance] file=$FILE_PATH chunk_size=$CHUNK_SIZE nice=$NICE_LEVEL ionice=$IONICE_CLASS/$IONICE_LEVEL"
if command -v ionice >/dev/null 2>&1; then
  nice -n "$NICE_LEVEL" ionice -c "$IONICE_CLASS" -n "$IONICE_LEVEL" "${COMMAND[@]}"
else
  nice -n "$NICE_LEVEL" "${COMMAND[@]}"
fi
echo "[asan-annual-performance] done $(date '+%Y-%m-%d %H:%M:%S')"
