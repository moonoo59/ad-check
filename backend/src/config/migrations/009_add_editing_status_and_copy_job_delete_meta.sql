-- Migration 009: 요청 수정중(editing) 상태 + copy_jobs 삭제 메타데이터 추가
--
-- 변경 내용:
--   1. requests.status CHECK 에 'editing' 상태 추가
--   2. copy_jobs.deleted_at / deleted_by 컬럼 추가
--
-- 주의:
--   SQLite 는 CHECK 제약식만 부분 수정하는 ALTER TABLE 을 지원하지 않으므로
--   requests 테이블을 재생성한 뒤 데이터를 다시 복사한다.

ALTER TABLE copy_jobs ADD COLUMN deleted_at TEXT;
ALTER TABLE copy_jobs ADD COLUMN deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS idx_requests_requester_id;
DROP INDEX IF EXISTS idx_requests_status;
DROP INDEX IF EXISTS idx_requests_created_at;
DROP INDEX IF EXISTS idx_requests_active;

ALTER TABLE requests RENAME TO requests_old;

CREATE TABLE requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id    INTEGER NOT NULL
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  request_memo    TEXT,
  status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                      'pending',
                      'searching',
                      'search_done',
                      'approved',
                      'copying',
                      'editing',
                      'done',
                      'failed',
                      'rejected'
                    )),
  reviewed_by     INTEGER
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  reviewed_at     TEXT,
  reject_reason   TEXT,
  is_deleted      INTEGER NOT NULL DEFAULT 0
                    CHECK (is_deleted IN (0, 1)),
  deleted_at      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO requests (
  id,
  requester_id,
  request_memo,
  status,
  reviewed_by,
  reviewed_at,
  reject_reason,
  is_deleted,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  id,
  requester_id,
  request_memo,
  status,
  reviewed_by,
  reviewed_at,
  reject_reason,
  is_deleted,
  deleted_at,
  created_at,
  updated_at
FROM requests_old;

DROP TABLE requests_old;

CREATE INDEX IF NOT EXISTS idx_requests_requester_id ON requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_status       ON requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_created_at   ON requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_active       ON requests (is_deleted, status, created_at DESC);
