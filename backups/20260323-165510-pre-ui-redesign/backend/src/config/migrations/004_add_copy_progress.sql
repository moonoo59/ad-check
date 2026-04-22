-- ============================================================
-- 마이그레이션 004: copy_jobs 진행률 컬럼 추가
-- 작성일: 2026-03-07
-- 목적: 파일 복사 중 진행률(소스/목적지 바이트 수) 표시를 위한 컬럼 추가
--
-- 변경 내용:
--   - copy_jobs.total_bytes   : 복사 대상 파일 전체 크기 (bytes)
--   - copy_jobs.progress_bytes: 현재까지 복사된 바이트 수 (0부터 시작)
--
-- 주의: SQLite는 ALTER TABLE ADD COLUMN만 지원함
--       컬럼 삭제/순서 변경 불가
-- ============================================================

-- 전체 파일 크기 (복사 시작 전 stat으로 조회 후 저장)
ALTER TABLE copy_jobs ADD COLUMN total_bytes INTEGER;

-- 현재 복사된 바이트 수 (스트림 data 이벤트에서 주기적으로 업데이트)
ALTER TABLE copy_jobs ADD COLUMN progress_bytes INTEGER NOT NULL DEFAULT 0;
