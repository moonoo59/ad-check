#!/usr/bin/env bash
# =============================================================================
# DB 백업 스크립트
#
# 역할:
#   adcheck.db 파일을 날짜별로 백업 디렉토리에 복사한다.
#   최대 30일치만 보관하고 오래된 백업은 자동 삭제한다.
#
# 실행 방법:
#   bash scripts/backup-db.sh
#
# 자동 실행 (cron):
#   # 매일 오전 6시 실행 (crontab -e)
#   0 6 * * * /Users/admin/ad-check/ad-check/scripts/backup-db.sh >> /Users/admin/ad-check/ad-check/logs/backup.log 2>&1
#
# 백업 보관 경로:
#   /Users/admin/ad-check/ad-check/data/backups/adcheck-YYYYMMDD_HHMMSS.db
#
# 주의:
#   - DB 파일이 없으면 종료한다 (서버 미실행 상태 방어)
#   - SQLite WAL 모드 사용 중이므로 복사 전 VACUUM 없이 직접 복사해도 안전하다
#     (WAL 체크포인트는 복사 후 DB 파일 자체에서 자동 처리)
#   - 이 스크립트는 start.sh에서 서버 시작 전에 호출 가능하다
# =============================================================================

set -euo pipefail

# ─── 경로 설정 ────────────────────────────────────────────────────────────────

# 스크립트 위치 기준으로 프로젝트 루트 탐색
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

DB_FILE="$PROJECT_ROOT/data/adcheck.db"
BACKUP_DIR="$PROJECT_ROOT/data/backups"
LOG_PREFIX="[DB백업]"

# 보관 최대 일수 (이 일수를 초과한 백업 파일은 삭제)
MAX_DAYS=30

# ─── 사전 확인 ────────────────────────────────────────────────────────────────

echo "$LOG_PREFIX 백업 시작: $(date '+%Y-%m-%d %H:%M:%S')"

# DB 파일 존재 여부 확인
if [ ! -f "$DB_FILE" ]; then
  echo "$LOG_PREFIX [경고] DB 파일이 없습니다: $DB_FILE"
  echo "$LOG_PREFIX 서버가 최소 1회 실행된 후 백업이 가능합니다."
  exit 0
fi

# 백업 디렉토리 생성 (없으면 자동 생성)
mkdir -p "$BACKUP_DIR"

# ─── 백업 실행 ────────────────────────────────────────────────────────────────

# 타임스탬프 기반 파일명 생성 (초 단위, 동일 날짜 복수 실행 구분 가능)
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/adcheck-$TIMESTAMP.db"

# SQLite WAL 파일도 함께 복사 (WAL 모드 안전성)
# WAL 파일이 없는 경우(체크포인트 완료 상태)에는 무시
cp "$DB_FILE" "$BACKUP_FILE"

if [ -f "${DB_FILE}-wal" ]; then
  cp "${DB_FILE}-wal" "${BACKUP_FILE}-wal"
fi
if [ -f "${DB_FILE}-shm" ]; then
  cp "${DB_FILE}-shm" "${BACKUP_FILE}-shm"
fi

# 복사된 파일 크기 확인
BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "$LOG_PREFIX 백업 완료: $BACKUP_FILE ($BACKUP_SIZE)"

# ─── 오래된 백업 정리 ─────────────────────────────────────────────────────────

# MAX_DAYS일보다 오래된 백업 파일 삭제
# -mtime +N: N일 초과한 파일
DELETED_COUNT=0
while IFS= read -r old_file; do
  rm -f "$old_file"
  echo "$LOG_PREFIX 오래된 백업 삭제: $(basename "$old_file")"
  DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "$BACKUP_DIR" -name "adcheck-*.db" -mtime "+$MAX_DAYS" 2>/dev/null)

if [ "$DELETED_COUNT" -eq 0 ]; then
  echo "$LOG_PREFIX 삭제된 오래된 백업 없음"
else
  echo "$LOG_PREFIX 총 $DELETED_COUNT개 오래된 백업 삭제 완료"
fi

# ─── 백업 현황 출력 ───────────────────────────────────────────────────────────

BACKUP_COUNT=$(find "$BACKUP_DIR" -name "adcheck-*.db" 2>/dev/null | wc -l | tr -d ' ')
echo "$LOG_PREFIX 현재 보관 중인 백업: $BACKUP_COUNT개 (최대 ${MAX_DAYS}일 보관)"
echo "$LOG_PREFIX 백업 완료: $(date '+%Y-%m-%d %H:%M:%S')"
