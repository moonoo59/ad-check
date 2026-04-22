-- Migration 005: 요청 템플릿 테이블 추가
--
-- 목적:
--   자주 사용하는 요청 조합(영업담당자 + 항목 배열)을 저장하여
--   요청 등록 시 빠르게 불러올 수 있도록 한다.
--
-- 설계 결정:
--   - 사용자별 개인 템플릿 (user_id 기준 소유 분리)
--   - items_json: 항목 배열을 JSON 문자열로 저장
--     (별도 테이블보다 단순하고 유연. 항목 구조 변경 시 마이그레이션 불필요)
--   - is_deleted: 소프트 삭제 (물리 삭제 없음, 이력 보존)
--   - user_id FK: ON DELETE CASCADE (사용자 삭제 시 템플릿도 삭제)

CREATE TABLE IF NOT EXISTS request_templates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  name          TEXT    NOT NULL,        -- 템플릿 이름 (예: "대웅제약 월요일 요청")
  sales_manager TEXT    NOT NULL,        -- 영업담당자
  template_memo TEXT,                    -- 비고 (선택)
  items_json    TEXT    NOT NULL,        -- 항목 배열 JSON 직렬화
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 사용자별 템플릿 목록 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_request_templates_user_id
  ON request_templates(user_id, is_deleted);
