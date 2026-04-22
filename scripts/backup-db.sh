#!/usr/bin/env bash
# =============================================================================
# DB 백업 스크립트
#
# 역할:
#   SQLite 운영 DB를 단일 시점 스냅샷으로 백업한다.
#   최대 30일치만 보관하고 오래된 백업은 자동 삭제한다.
#
# 기본 동작:
#   1. 명시적 DB_PATH가 있으면 그 경로를 사용
#   2. 없으면 공용 운영 DB(~/Library/Application Support/AdCheck/data/adcheck.db)를 사용
#   3. APP_SUPPORT_DIR가 있으면 그 경로를 우선 반영
#
# 실행 방법:
#   bash scripts/backup-db.sh
#
# 선택 환경변수:
#   DB_PATH=/custom/path/adcheck.db
#   BACKUP_DIR=/custom/path/backups
#
# 주의:
#   - WAL/SHM 파일을 직접 복사하지 않는다.
#   - sqlite3 .backup 명령으로 일관된 단일 시점 백업을 생성한다.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_PREFIX="[DB백업]"
MAX_DAYS=30

APP_SUPPORT_DIR_DEFAULT="${APP_SUPPORT_DIR:-$HOME/Library/Application Support/AdCheck}"
DEFAULT_DB="$APP_SUPPORT_DIR_DEFAULT/data/adcheck.db"

resolve_input_path() {
  local input_path="$1"

  if [[ "$input_path" = /* ]]; then
    printf '%s\n' "$input_path"
    return
  fi

  printf '%s\n' "$PROJECT_ROOT/$input_path"
}

resolve_db_file() {
  if [[ -n "${DB_PATH:-}" ]]; then
    resolve_input_path "$DB_PATH"
    return
  fi
  printf '%s\n' "$DEFAULT_DB"
}

resolve_backup_dir() {
  if [[ -n "${BACKUP_DIR:-}" ]]; then
    resolve_input_path "$BACKUP_DIR"
    return
  fi

  local db_dir
  db_dir="$(dirname "$DB_FILE")"
  printf '%s\n' "$db_dir/backups"
}

DB_FILE="$(resolve_db_file)"
BACKUP_DIR="$(resolve_backup_dir)"

echo "$LOG_PREFIX 백업 시작: $(date '+%Y-%m-%d %H:%M:%S')"
echo "$LOG_PREFIX 원본 DB: $DB_FILE"
echo "$LOG_PREFIX 백업 폴더: $BACKUP_DIR"

if [[ ! -f "$DB_FILE" ]]; then
  echo "$LOG_PREFIX [경고] 백업할 DB 파일이 없습니다: $DB_FILE"
  echo "$LOG_PREFIX 앱을 최소 1회 실행했는지 또는 DB_PATH가 올바른지 확인하세요."
  exit 0
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "$LOG_PREFIX [오류] sqlite3 명령을 찾을 수 없습니다."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BACKUP_FILE="$BACKUP_DIR/adcheck-$TIMESTAMP.db"

if ! sqlite3 "$DB_FILE" ".timeout 5000" ".backup \"$BACKUP_FILE\""; then
  echo "$LOG_PREFIX [오류] sqlite3 백업 생성에 실패했습니다."
  rm -f "$BACKUP_FILE"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "$LOG_PREFIX [오류] 백업 파일이 생성되지 않았습니다."
  exit 1
fi

BACKUP_SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "$LOG_PREFIX 백업 완료: $BACKUP_FILE ($BACKUP_SIZE)"

DELETED_COUNT=0
while IFS= read -r old_file; do
  [[ -z "$old_file" ]] && continue
  rm -f "$old_file"
  echo "$LOG_PREFIX 오래된 백업 삭제: $(basename "$old_file")"
  DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "$BACKUP_DIR" -name "adcheck-*.db" -mtime "+$MAX_DAYS" 2>/dev/null)

if [[ "$DELETED_COUNT" -eq 0 ]]; then
  echo "$LOG_PREFIX 삭제된 오래된 백업 없음"
else
  echo "$LOG_PREFIX 총 $DELETED_COUNT개 오래된 백업 삭제 완료"
fi

BACKUP_COUNT="$(find "$BACKUP_DIR" -name "adcheck-*.db" 2>/dev/null | wc -l | tr -d ' ')"
echo "$LOG_PREFIX 현재 보관 중인 백업: $BACKUP_COUNT개 (최대 ${MAX_DAYS}일 보관)"
echo "$LOG_PREFIX 백업 완료 시각: $(date '+%Y-%m-%d %H:%M:%S')"
