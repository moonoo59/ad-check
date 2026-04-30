-- 사용자 모델 단순화
--
-- 변경 내용:
--   1. tech_team 역할을 ad_team으로 일괄 변환 (운영 DB에 잔존 시 대비)
--   2. users 테이블 재생성:
--      - 제거 컬럼: phone, email, assigned_channels, can_copy, can_view_stats
--      - role CHECK 제약을 ('ad_team', 'admin') 두 가지로 축소
--   3. user_registrations 테이블 폐기 (회원가입 신청 기능 제거)
--
-- 외래키 영향:
--   - users.id 를 참조하는 모든 FK 는 id 값 그대로 보존되므로 안전
--   - user_registrations.reviewed_by → users(id) ON DELETE SET NULL
--     → 테이블 자체를 DROP 하므로 참조 관계 소멸

-- ─── 1. tech_team → ad_team 변환 ─────────────────────────────────────────────
UPDATE users SET role = 'ad_team' WHERE role = 'tech_team';

-- ─── 2. users 테이블 재생성 ─────────────────────────────────────────────────
-- SQLite 는 ALTER TABLE 로 CHECK 제약 수정이 불가하므로
-- 새 테이블 생성 → 데이터 이전 → 기존 테이블 교체 순서로 진행한다.

CREATE TABLE users_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 내부 식별자: 'admin' 또는 'ad_team' 고정값으로 사용
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('ad_team', 'admin')),
  password_hash TEXT    NOT NULL DEFAULT '',
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 데이터 이전 (id 동일하게 보존 → 외래키 참조 유지)
INSERT INTO users_new (id, username, display_name, role, password_hash, is_active, created_at, updated_at)
SELECT id, username, display_name, role, COALESCE(password_hash, ''), is_active, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 인덱스 재생성
CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_role     ON users (role);

-- ─── 3. user_registrations 폐기 ──────────────────────────────────────────────
DROP TABLE IF EXISTS user_registrations;
