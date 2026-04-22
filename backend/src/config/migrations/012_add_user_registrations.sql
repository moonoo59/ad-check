-- 회원가입 신청 기능 추가
--
-- 1. user_registrations 테이블: 신청 정보 보관 (승인 전 대기 상태)
-- 2. users.assigned_channels: 사용자별 담당채널 JSON 배열 추가
--
-- 흐름:
--   신청 → user_registrations (status=pending)
--   승인 → users INSERT + status=approved
--   반려 → status=rejected (이력 보존)

-- ─── 1. user_registrations 테이블 ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_registrations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT    NOT NULL,
  display_name    TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK(role IN ('admin', 'tech_team', 'ad_team')),
  password_hash   TEXT    NOT NULL,
  -- 담당채널: JSON 배열 문자열 (예: '["비즈","스포츠"]')
  assigned_channels TEXT NOT NULL DEFAULT '[]',
  -- 신청 상태: pending=대기, approved=승인됨, rejected=반려됨
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  reviewed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TEXT,     -- UTC ISO 8601, 처리 시각
  reject_reason   TEXT,     -- 반려 사유
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 상태별 조회 성능 (pending 목록 조회가 빈번)
CREATE INDEX IF NOT EXISTS idx_user_registrations_status ON user_registrations(status);
-- 역할별 필터링 (tech_team이 ad_team 신청만 볼 때)
CREATE INDEX IF NOT EXISTS idx_user_registrations_role   ON user_registrations(role);
-- username 중복 신청 빠른 확인
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_registrations_username ON user_registrations(username);

-- ─── 2. users.assigned_channels 컬럼 추가 ────────────────────────────────────
-- 기존 사용자는 기본값 빈 배열로 초기화

ALTER TABLE users ADD COLUMN assigned_channels TEXT NOT NULL DEFAULT '[]';
