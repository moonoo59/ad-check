-- Migration 010: 레거시 KST 로컬 시각 문자열 UTC 정규화 + 요청 계열 FK 정합성 복구
--
-- 배경:
--   - 초기 스키마 기본값은 datetime('now', 'localtime') 를 사용했다.
--   - 이후 애플리케이션 코드는 new Date().toISOString() 를 사용해 UTC ISO를 저장했다.
--   - 그 결과 같은 created_at/updated_at 계열 컬럼에
--       1) '2026-03-23 17:45:04' (KST 로컬 문자열)
--       2) '2026-03-23T08:45:04.000Z' (UTC ISO)
--     가 혼재하게 되었다.
--
-- 목적:
--   - 기존 로컬 문자열을 UTC ISO 8601 형식으로 일괄 변환해
--     기간 필터/통계/감사 로그 정렬 기준을 하나로 통일한다.
--   - migration 009의 requests 재생성 이후 request_items/resend_logs가
--     requests_old 를 계속 가리키는 FK 드리프트를 복구한다.
--
-- 변환 규칙:
--   - 'YYYY-MM-DD HH:MM:SS' 는 KST(+09:00) 기준으로 해석
--   - UTC로 변환한 뒤 'YYYY-MM-DDTHH:MM:SS.SSSZ' 계열 문자열로 저장
--   - 이미 'T' 를 포함한 ISO 형식 값은 그대로 둔다.

UPDATE schema_migrations
SET applied_at = strftime('%Y-%m-%dT%H:%M:%fZ', datetime(applied_at, '-9 hours'))
WHERE applied_at IS NOT NULL
  AND instr(applied_at, 'T') = 0;

UPDATE users
SET
  created_at = CASE
    WHEN created_at IS NOT NULL AND instr(created_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
    ELSE created_at
  END,
  updated_at = CASE
    WHEN updated_at IS NOT NULL AND instr(updated_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(updated_at, '-9 hours'))
    ELSE updated_at
  END;

UPDATE channel_mappings
SET
  created_at = CASE
    WHEN created_at IS NOT NULL AND instr(created_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
    ELSE created_at
  END,
  updated_at = CASE
    WHEN updated_at IS NOT NULL AND instr(updated_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(updated_at, '-9 hours'))
    ELSE updated_at
  END;

UPDATE channel_mapping_histories
SET
  changed_at = CASE
    WHEN changed_at IS NOT NULL AND instr(changed_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(changed_at, '-9 hours'))
    ELSE changed_at
  END,
  created_at = CASE
    WHEN created_at IS NOT NULL AND instr(created_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
    ELSE created_at
  END;

UPDATE mount_logs
SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
WHERE created_at IS NOT NULL
  AND instr(created_at, 'T') = 0;

UPDATE audit_logs
SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
WHERE created_at IS NOT NULL
  AND instr(created_at, 'T') = 0;

ALTER TABLE copy_jobs RENAME TO copy_jobs_old_010;
ALTER TABLE file_search_results RENAME TO file_search_results_old_010;
ALTER TABLE request_items RENAME TO request_items_old_010;
ALTER TABLE resend_logs RENAME TO resend_logs_old_010;
ALTER TABLE requests RENAME TO requests_old_010;

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
  CASE
    WHEN reviewed_at IS NOT NULL AND instr(reviewed_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(reviewed_at, '-9 hours'))
    ELSE reviewed_at
  END,
  reject_reason,
  is_deleted,
  CASE
    WHEN deleted_at IS NOT NULL AND instr(deleted_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(deleted_at, '-9 hours'))
    ELSE deleted_at
  END,
  CASE
    WHEN created_at IS NOT NULL AND instr(created_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
    ELSE created_at
  END,
  CASE
    WHEN updated_at IS NOT NULL AND instr(updated_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(updated_at, '-9 hours'))
    ELSE updated_at
  END
FROM requests_old_010;

CREATE TABLE request_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id          INTEGER NOT NULL
    REFERENCES requests (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  channel_mapping_id  INTEGER NOT NULL
    REFERENCES channel_mappings (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  advertiser          TEXT    NOT NULL,
  broadcast_date      TEXT    NOT NULL,
  req_time_start      TEXT    NOT NULL,
  req_time_end        TEXT    NOT NULL,
  monitoring_time     TEXT    NOT NULL,
  item_memo           TEXT,
  item_status         TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (item_status IN (
                          'pending',
                          'searching',
                          'search_done',
                          'approved',
                          'copying',
                          'done',
                          'failed',
                          'rejected'
                        )),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sales_manager       TEXT    NOT NULL DEFAULT ''
);

INSERT INTO request_items (
  id,
  request_id,
  channel_mapping_id,
  advertiser,
  broadcast_date,
  req_time_start,
  req_time_end,
  monitoring_time,
  item_memo,
  item_status,
  sort_order,
  created_at,
  updated_at,
  sales_manager
)
SELECT
  id,
  request_id,
  channel_mapping_id,
  advertiser,
  broadcast_date,
  req_time_start,
  req_time_end,
  monitoring_time,
  item_memo,
  item_status,
  sort_order,
  CASE
    WHEN created_at IS NOT NULL AND instr(created_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
    ELSE created_at
  END,
  CASE
    WHEN updated_at IS NOT NULL AND instr(updated_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(updated_at, '-9 hours'))
    ELSE updated_at
  END,
  sales_manager
FROM request_items_old_010;

CREATE TABLE file_search_results (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  request_item_id     INTEGER NOT NULL
    REFERENCES request_items (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  file_path           TEXT    NOT NULL,
  file_name           TEXT    NOT NULL,
  file_size_bytes     INTEGER,
  file_start_time     TEXT,
  file_end_time       TEXT,
  file_mtime          TEXT,
  match_score         INTEGER NOT NULL DEFAULT 0
                        CHECK (match_score BETWEEN 0 AND 100),
  match_reason        TEXT,
  is_selected         INTEGER NOT NULL DEFAULT 0
                        CHECK (is_selected IN (0, 1)),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO file_search_results (
  id,
  request_item_id,
  file_path,
  file_name,
  file_size_bytes,
  file_start_time,
  file_end_time,
  file_mtime,
  match_score,
  match_reason,
  is_selected,
  created_at,
  updated_at
)
SELECT
  id,
  request_item_id,
  file_path,
  file_name,
  file_size_bytes,
  file_start_time,
  file_end_time,
  file_mtime,
  match_score,
  match_reason,
  is_selected,
  CASE
    WHEN created_at IS NOT NULL AND instr(created_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
    ELSE created_at
  END,
  CASE
    WHEN updated_at IS NOT NULL AND instr(updated_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(updated_at, '-9 hours'))
    ELSE updated_at
  END
FROM file_search_results_old_010;

CREATE TABLE copy_jobs (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  request_item_id         INTEGER NOT NULL
    REFERENCES request_items (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  file_search_result_id   INTEGER NOT NULL
    REFERENCES file_search_results (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  source_path             TEXT    NOT NULL,
  dest_path               TEXT    NOT NULL,
  status                  TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending',
                              'copying',
                              'done',
                              'failed'
                            )),
  approved_by             INTEGER
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  approved_at             TEXT,
  started_at              TEXT,
  completed_at            TEXT,
  error_message           TEXT,
  retry_count             INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  total_bytes             INTEGER,
  progress_bytes          INTEGER NOT NULL DEFAULT 0,
  deleted_at              TEXT,
  deleted_by              INTEGER
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO copy_jobs (
  id,
  request_item_id,
  file_search_result_id,
  source_path,
  dest_path,
  status,
  approved_by,
  approved_at,
  started_at,
  completed_at,
  error_message,
  retry_count,
  created_at,
  updated_at,
  total_bytes,
  progress_bytes,
  deleted_at,
  deleted_by
)
SELECT
  id,
  request_item_id,
  file_search_result_id,
  source_path,
  dest_path,
  status,
  approved_by,
  CASE
    WHEN approved_at IS NOT NULL AND instr(approved_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(approved_at, '-9 hours'))
    ELSE approved_at
  END,
  CASE
    WHEN started_at IS NOT NULL AND instr(started_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(started_at, '-9 hours'))
    ELSE started_at
  END,
  CASE
    WHEN completed_at IS NOT NULL AND instr(completed_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(completed_at, '-9 hours'))
    ELSE completed_at
  END,
  error_message,
  retry_count,
  CASE
    WHEN created_at IS NOT NULL AND instr(created_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
    ELSE created_at
  END,
  CASE
    WHEN updated_at IS NOT NULL AND instr(updated_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(updated_at, '-9 hours'))
    ELSE updated_at
  END,
  total_bytes,
  progress_bytes,
  CASE
    WHEN deleted_at IS NOT NULL AND instr(deleted_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(deleted_at, '-9 hours'))
    ELSE deleted_at
  END,
  deleted_by
FROM copy_jobs_old_010;

CREATE TABLE resend_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id        INTEGER NOT NULL,
  reason            TEXT    NOT NULL,
  requested_by      INTEGER NOT NULL,
  requested_by_name TEXT    NOT NULL,
  created_at        TEXT    NOT NULL,
  FOREIGN KEY (request_id)   REFERENCES requests(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
);

INSERT INTO resend_logs (
  id,
  request_id,
  reason,
  requested_by,
  requested_by_name,
  created_at
)
SELECT
  id,
  request_id,
  reason,
  requested_by,
  requested_by_name,
  CASE
    WHEN created_at IS NOT NULL AND instr(created_at, 'T') = 0
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(created_at, '-9 hours'))
    ELSE created_at
  END
FROM resend_logs_old_010;

DROP TABLE copy_jobs_old_010;
DROP TABLE file_search_results_old_010;
DROP TABLE request_items_old_010;
DROP TABLE resend_logs_old_010;
DROP TABLE requests_old_010;

CREATE INDEX IF NOT EXISTS idx_requests_requester_id ON requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_status       ON requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_created_at   ON requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_active       ON requests (is_deleted, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_items_request_id
  ON request_items (request_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_request_items_channel_date
  ON request_items (channel_mapping_id, broadcast_date);
CREATE INDEX IF NOT EXISTS idx_request_items_status
  ON request_items (item_status);

CREATE INDEX IF NOT EXISTS idx_file_search_results_item_id
  ON file_search_results (request_item_id, match_score DESC);
CREATE INDEX IF NOT EXISTS idx_file_search_results_selected
  ON file_search_results (request_item_id, is_selected);

CREATE INDEX IF NOT EXISTS idx_copy_jobs_status       ON copy_jobs (status);
CREATE INDEX IF NOT EXISTS idx_copy_jobs_request_item ON copy_jobs (request_item_id);

CREATE INDEX IF NOT EXISTS idx_resend_logs_request_id ON resend_logs(request_id);
