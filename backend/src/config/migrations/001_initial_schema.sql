-- ============================================================
-- 마이그레이션 001: 초기 스키마 생성
-- 작성일: 2026-03-06
-- 목적: MVP Phase 1에 필요한 전체 테이블 구조 생성
--
-- 테이블 목록:
--   1. users               - 사용자 (광고팀/기술팀/관리자)
--   2. channel_mappings    - 채널명 매핑 (Logger Storage ↔ 공유 NAS)
--   3. channel_mapping_histories - 채널 매핑 변경 이력
--   4. requests            - 광고 증빙 요청 (헤더)
--   5. request_items       - 요청 상세 행 (채널/광고주/시간대)
--   6. file_search_results - 자동 파일 탐색 결과
--   7. copy_jobs           - 파일 복사 작업 (상태 추적)
--   8. mount_logs          - 스토리지 마운트/언마운트 이력
--   9. audit_logs          - 전체 작업 감사 로그
--
-- 주의: SQLite는 FOREIGN KEY를 기본 비활성 → pragma foreign_keys = ON 필요
--       (database.ts에서 이미 설정됨)
-- ============================================================


-- ============================================================
-- 1. users - 사용자 테이블
--
-- 역할 구분:
--   'ad_team'   : 광고팀 - 요청 등록, 결과 확인
--   'tech_team' : 기술팀 - 요청 검토, 승인/반려, 로그 조회
--   'admin'     : 관리자 - 채널 매핑 관리, 마운트 제어, 사용자 관리
--
-- 소프트 삭제 적용: 퇴직/비활성화 사용자도 이력 추적을 위해 보존
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    NOT NULL UNIQUE,                -- 로그인 ID (사내 계정명)
  display_name TEXT    NOT NULL,                       -- 화면 표시 이름
  role         TEXT    NOT NULL                        -- 역할: 'ad_team' | 'tech_team' | 'admin'
                 CHECK (role IN ('ad_team', 'tech_team', 'admin')),
  is_active    INTEGER NOT NULL DEFAULT 1              -- 1: 활성, 0: 비활성(퇴직/휴직 등)
                 CHECK (is_active IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 인덱스: 로그인 시 username 조회, 역할별 목록 조회에 사용
CREATE INDEX IF NOT EXISTS idx_users_username  ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_role      ON users (role);


-- ============================================================
-- 2. channel_mappings - 채널명 매핑 테이블
--
-- Logger Storage 폴더명(저장 기준)과 화면 표시명, NAS 폴더명을 분리 관리.
-- 채널명은 운영 중 변경될 수 있으므로 하드코딩 금지.
--
-- 예시:
--   storage_folder='ETV' → display_name='라이프' → nas_folder='라이프'
--   storage_folder='GOLF' → display_name='골프' → nas_folder='골프'
--
-- 소프트 삭제 적용: 과거 요청 이력에서 채널 참조 보존
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_mappings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_folder TEXT    NOT NULL UNIQUE,              -- Logger Storage 폴더명 (예: ETV, GOLF)
  display_name   TEXT    NOT NULL,                     -- 화면 표시용 채널명 (예: 라이프, 골프)
  nas_folder     TEXT    NOT NULL,                     -- 공유 NAS 복사 대상 폴더명
  description    TEXT,                                 -- 채널 설명 (선택, 예: ESPN → 스포츠 채널)
  is_active      INTEGER NOT NULL DEFAULT 1            -- 1: 활성 (사용 중), 0: 비활성 (폐채널 등)
                   CHECK (is_active IN (0, 1)),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 인덱스: 파일 탐색 시 storage_folder 기준 조회, 화면 표시 시 display_name 조회에 사용
CREATE INDEX IF NOT EXISTS idx_channel_mappings_storage_folder ON channel_mappings (storage_folder);
CREATE INDEX IF NOT EXISTS idx_channel_mappings_is_active      ON channel_mappings (is_active);


-- ============================================================
-- 3. channel_mapping_histories - 채널 매핑 변경 이력
--
-- 채널 매핑이 변경될 때마다 이력을 기록.
-- 과거 요청 건을 소급 추적할 때나, 변경 감사 시 활용.
--
-- 변경 방식: channel_mappings 수정 시 이 테이블에 변경 전 값을 INSERT
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_mapping_histories (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_mapping_id  INTEGER NOT NULL                 -- 변경된 채널 매핑 ID
    REFERENCES channel_mappings (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  changed_by          INTEGER NOT NULL                 -- 변경한 사용자 ID
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  field_name          TEXT    NOT NULL,                -- 변경된 필드명 (예: 'display_name', 'nas_folder')
  old_value           TEXT,                            -- 변경 전 값 (NULL: 최초 생성)
  new_value           TEXT,                            -- 변경 후 값
  changed_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 인덱스: 특정 채널 매핑의 변경 이력 시간순 조회에 사용
CREATE INDEX IF NOT EXISTS idx_channel_mapping_histories_mapping_id
  ON channel_mapping_histories (channel_mapping_id, changed_at);


-- ============================================================
-- 4. requests - 광고 증빙 요청 테이블 (헤더)
--
-- 한 건의 요청은 여러 줄(request_items)을 가질 수 있다.
-- 이 테이블은 요청 전체를 대표하는 헤더 정보.
--
-- 상태 흐름 (status):
--   pending → searching → search_done → approved → copying → done
--                                   └→ rejected
--                         └→ failed (탐색 실패)
--
-- 소프트 삭제 적용: 요청 기록은 감사/통계 목적으로 보존
-- ============================================================
CREATE TABLE IF NOT EXISTS requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id    INTEGER NOT NULL                     -- 요청자 (users.id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  sales_manager   TEXT    NOT NULL,                    -- 영업담당자 이름 (자유 입력)
  request_memo    TEXT,                                -- 요청 전체 비고 / 추가 요청사항
  status          TEXT    NOT NULL DEFAULT 'pending'   -- 요청 전체 상태
                    CHECK (status IN (
                      'pending',       -- 접수 대기 (등록만 된 상태)
                      'searching',     -- 파일 탐색 중
                      'search_done',   -- 탐색 완료 (기술팀 승인 대기)
                      'approved',      -- 기술팀 승인 완료 (복사 대기)
                      'copying',       -- 파일 복사 중
                      'done',          -- 전체 완료
                      'failed',        -- 탐색 또는 복사 실패
                      'rejected'       -- 기술팀 반려
                    )),
  reviewed_by     INTEGER                              -- 검토/승인한 기술팀 사용자 ID
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  reviewed_at     TEXT,                                -- 검토/승인 일시
  reject_reason   TEXT,                                -- 반려 사유 (rejected 상태일 때)
  is_deleted      INTEGER NOT NULL DEFAULT 0           -- 소프트 삭제 플래그
                    CHECK (is_deleted IN (0, 1)),
  deleted_at      TEXT,                                -- 삭제 일시
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 인덱스: 요청자별 목록, 상태별 목록, 생성일 정렬에 사용
CREATE INDEX IF NOT EXISTS idx_requests_requester_id ON requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_status       ON requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_created_at   ON requests (created_at DESC);
-- 삭제되지 않은 요청만 조회하는 복합 인덱스 (목록 화면 기본 쿼리)
CREATE INDEX IF NOT EXISTS idx_requests_active       ON requests (is_deleted, status, created_at DESC);


-- ============================================================
-- 5. request_items - 요청 상세 행 테이블
--
-- 한 건의 요청(requests)에 속하는 개별 광고주/채널/시간대 단위.
-- 파일 탐색과 복사는 이 단위로 각각 실행된다.
--
-- 개별 상태(item_status)는 requests.status와 별도로 추적:
--   requests.status는 전체 요청의 대표 상태,
--   request_items.item_status는 각 행의 처리 상태.
-- ============================================================
CREATE TABLE IF NOT EXISTS request_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id          INTEGER NOT NULL                 -- 소속 요청 헤더 ID
    REFERENCES requests (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  channel_mapping_id  INTEGER NOT NULL                 -- 채널 매핑 참조 (channel_mappings.id)
    REFERENCES channel_mappings (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  advertiser          TEXT    NOT NULL,                -- 광고주명 (자유 입력)
  broadcast_date      TEXT    NOT NULL,                -- 방송일자 (YYYY-MM-DD)
  req_time_start      TEXT    NOT NULL,                -- 파일 요청 시간대 시작 (HH:MM)
  req_time_end        TEXT    NOT NULL,                -- 파일 요청 시간대 종료 (HH:MM)
  monitoring_time     TEXT    NOT NULL,                -- 모니터링 송출 시간 (HH:MM 또는 HH:MM:SS)
  item_memo           TEXT,                            -- 항목별 메모 (선택)
  item_status         TEXT    NOT NULL DEFAULT 'pending'  -- 개별 처리 상태
                        CHECK (item_status IN (
                          'pending',       -- 대기
                          'searching',     -- 파일 탐색 중
                          'search_done',   -- 탐색 완료
                          'approved',      -- 승인됨
                          'copying',       -- 복사 중
                          'done',          -- 완료
                          'failed',        -- 실패
                          'rejected'       -- 반려
                        )),
  sort_order          INTEGER NOT NULL DEFAULT 0,      -- 요청 내 행 순서 (화면 표시용)
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 인덱스: 요청별 항목 조회, 채널별/방송일별 통계 쿼리에 사용
CREATE INDEX IF NOT EXISTS idx_request_items_request_id
  ON request_items (request_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_request_items_channel_date
  ON request_items (channel_mapping_id, broadcast_date);
CREATE INDEX IF NOT EXISTS idx_request_items_status
  ON request_items (item_status);


-- ============================================================
-- 6. file_search_results - 파일 탐색 결과 테이블
--
-- 기술팀이 "확인" 버튼을 누르면 시스템이 Logger Storage에서
-- 조건에 맞는 파일을 찾아 여기에 기록한다.
--
-- 파일이 여러 개 매칭될 수 있으므로 리스트로 저장.
-- 기술팀이 검토 후 최종 파일을 선택(is_selected=1)한다.
--
-- 주의: 파일명 패턴 분석 결과(시작/종료 시각 등)는 파싱 추정값이므로
--       실제 파일 내용과 다를 수 있다. 기술팀 검증 필수.
-- ============================================================
CREATE TABLE IF NOT EXISTS file_search_results (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  request_item_id     INTEGER NOT NULL                 -- 어느 요청 항목의 탐색 결과인지
    REFERENCES request_items (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  file_path           TEXT    NOT NULL,                -- 원본 파일 절대 경로
  file_name           TEXT    NOT NULL,                -- 파일명 (예: ETV_20260303_015955_0300.avi)
  file_size_bytes     INTEGER,                         -- 파일 크기 (bytes, NULL이면 조회 실패)
  file_start_time     TEXT,                            -- 파일명 파싱 기준 시작 시각 (HH:MM:SS)
  file_end_time       TEXT,                            -- 파일명 파싱 기준 종료 시각 (HH:MM:SS, 약 1시간5분 후)
  file_mtime          TEXT,                            -- OS 파일 수정 시각 (ISO 8601)
  match_score         INTEGER NOT NULL DEFAULT 0       -- 매칭 신뢰도 (0~100, 높을수록 정확)
                        CHECK (match_score BETWEEN 0 AND 100),
  match_reason        TEXT,                            -- 매칭 근거 설명 (기술팀 검토용)
  is_selected         INTEGER NOT NULL DEFAULT 0       -- 기술팀이 최종 선택한 파일: 1
                        CHECK (is_selected IN (0, 1)),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 인덱스: 요청 항목별 탐색 결과 조회, 선택된 파일만 조회에 사용
CREATE INDEX IF NOT EXISTS idx_file_search_results_item_id
  ON file_search_results (request_item_id, match_score DESC);
CREATE INDEX IF NOT EXISTS idx_file_search_results_selected
  ON file_search_results (request_item_id, is_selected);


-- ============================================================
-- 7. copy_jobs - 파일 복사 작업 테이블
--
-- 기술팀 승인 후 실제 복사 작업을 추적하는 테이블.
-- 한 request_item 당 하나의 copy_job이 생성된다.
--
-- 상태 흐름:
--   pending → copying → done
--          └→ failed (재시도 가능)
--
-- 중복 복사 방지: 동일 request_item_id에 'done' 상태 job이 있으면
--                 새 job 생성을 애플리케이션 레벨에서 차단해야 한다.
-- ============================================================
CREATE TABLE IF NOT EXISTS copy_jobs (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  request_item_id         INTEGER NOT NULL             -- 어느 요청 항목의 복사 작업인지
    REFERENCES request_items (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  file_search_result_id   INTEGER NOT NULL             -- 선택된 파일 탐색 결과
    REFERENCES file_search_results (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  source_path             TEXT    NOT NULL,            -- 복사 원본 경로 (Logger Storage)
  dest_path               TEXT    NOT NULL,            -- 복사 대상 경로 (공유 NAS)
  status                  TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending',    -- 복사 대기 (승인 후 큐 등록)
                              'copying',    -- 복사 진행 중
                              'done',       -- 복사 완료
                              'failed'      -- 복사 실패 (error_message 참조)
                            )),
  approved_by             INTEGER                      -- 승인한 기술팀 사용자 ID
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  approved_at             TEXT,                        -- 승인 일시
  started_at              TEXT,                        -- 복사 시작 일시
  completed_at            TEXT,                        -- 복사 완료 일시 (성공 또는 실패 시)
  error_message           TEXT,                        -- 실패 원인 메시지
  retry_count             INTEGER NOT NULL DEFAULT 0,  -- 재시도 횟수 (최대 재시도 횟수는 앱에서 제어)
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 인덱스: 상태별 복사 작업 조회, 요청 항목별 조회에 사용
CREATE INDEX IF NOT EXISTS idx_copy_jobs_status         ON copy_jobs (status);
CREATE INDEX IF NOT EXISTS idx_copy_jobs_request_item   ON copy_jobs (request_item_id);


-- ============================================================
-- 8. mount_logs - 스토리지 마운트/언마운트 이력
--
-- Logger Storage와 공유 NAS의 마운트 상태 변경을 모두 기록.
-- 보안 제어 기능의 핵심: 마운트 이력이 곧 접근 이력이다.
--
-- storage_type:
--   'logger_storage' : 방송망 NAS (Logger Storage, 기술팀만 접근 가능)
--   'shared_nas'     : 광고팀/기술팀 공유 NAS
--
-- triggered_by:
--   'startup'  : 서비스 시작 시 자동 마운트
--   'shutdown' : 서비스 종료 시 자동 언마운트
--   'admin'    : 관리자 화면에서 수동 조작
--   'system'   : 비정상 종료 감지 후 자동 조치
-- ============================================================
CREATE TABLE IF NOT EXISTS mount_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_type     TEXT    NOT NULL                    -- 어느 스토리지인지
                     CHECK (storage_type IN ('logger_storage', 'shared_nas')),
  action           TEXT    NOT NULL                    -- 수행한 동작
                     CHECK (action IN ('mount', 'unmount')),
  status           TEXT    NOT NULL                    -- 실행 결과
                     CHECK (status IN ('success', 'failed')),
  triggered_by     TEXT    NOT NULL                    -- 발생 원인
                     CHECK (triggered_by IN ('startup', 'shutdown', 'admin', 'system')),
  triggered_user_id INTEGER                            -- 관리자가 직접 조작한 경우 사용자 ID
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  mount_point      TEXT,                               -- 마운트 경로 (예: /Volumes/LoggerStorage)
  error_message    TEXT,                               -- 실패 시 오류 메시지
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  -- 마운트 이력은 변경되지 않으므로 updated_at 불필요
);

-- 인덱스: 최근 이력 시간순 조회, 스토리지별 + 최근 상태 확인에 사용
CREATE INDEX IF NOT EXISTS idx_mount_logs_created_at     ON mount_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mount_logs_storage_action ON mount_logs (storage_type, action, created_at DESC);


-- ============================================================
-- 9. audit_logs - 전체 작업 감사 로그
--
-- 시스템 내 주요 행위를 모두 기록하는 감사 테이블.
-- 보안 감사, 장애 추적, 통계 분석의 기반 데이터.
--
-- entity_type과 entity_id는 느슨한 참조(SOFT REFERENCE):
--   - 외래키 제약 없음 (엔티티 삭제 후에도 로그 보존)
--   - 조회 시 LEFT JOIN으로 처리
--
-- action 예시:
--   'request_create', 'request_approve', 'request_reject',
--   'search_start', 'search_done', 'search_failed',
--   'copy_approve', 'copy_start', 'copy_done', 'copy_failed',
--   'channel_mapping_update', 'mount_execute', 'unmount_execute',
--   'user_login', 'user_logout', 'user_create', 'user_deactivate'
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,                                -- 행위자 ID (NULL: 시스템 자동 행위)
  action       TEXT    NOT NULL,                       -- 수행한 행위 코드
  entity_type  TEXT,                                   -- 대상 엔티티 종류 (예: 'request', 'copy_job')
  entity_id    INTEGER,                                -- 대상 엔티티 ID (느슨한 참조)
  detail       TEXT,                                   -- 추가 정보 (JSON 문자열 권장)
  ip_address   TEXT,                                   -- 요청자 IP (내부망이지만 기록 권장)
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  -- 감사 로그는 불변(Immutable)이므로 updated_at 불필요
);

-- 인덱스: 사용자별 행위 조회, 엔티티별 이력 조회, 시간순 전체 조회에 사용
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity      ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs (created_at DESC);
