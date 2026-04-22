-- ============================================================
-- 마이그레이션 011: 사용자별 기능 권한 컬럼 추가
-- 작성일: 2026-04-03
-- 목적: 역할(role)과 별개로 기능별 세분화된 권한 부여 지원
--
-- 추가 컬럼:
--   can_copy       — 파일 탐색/선택/승인/복사 실행 권한 (기본: tech_team, admin)
--   can_view_stats — 통계 대시보드 조회 권한 (기본: admin)
--
-- 설계 원칙:
--   - admin 역할은 컬럼 값과 무관하게 항상 모든 권한 보유
--   - 역할 기반 기본값은 이 마이그레이션에서 설정하고,
--     이후 관리자가 사용자별로 개별 조정 가능
-- ============================================================

-- 기능별 권한 컬럼 추가 (기본값 0 = 권한 없음)
ALTER TABLE users ADD COLUMN can_copy       INTEGER NOT NULL DEFAULT 0 CHECK (can_copy IN (0, 1));
ALTER TABLE users ADD COLUMN can_view_stats INTEGER NOT NULL DEFAULT 0 CHECK (can_view_stats IN (0, 1));

-- 기존 tech_team 사용자에게 can_copy 권한 부여
UPDATE users SET can_copy = 1 WHERE role = 'tech_team';

-- 기존 admin 사용자에게 모든 권한 부여
UPDATE users SET can_copy = 1, can_view_stats = 1 WHERE role = 'admin';
