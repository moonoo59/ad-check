-- Migration 006: 영업담당자(sales_manager)를 요청 헤더에서 항목별 필드로 이동
--
-- 배경:
--   같은 요청 안에서도 채널별로 담당 영업담당자가 다를 수 있다는 업무 요건 반영.
--   기존에는 requests 테이블에 하나의 sales_manager만 저장했으나,
--   request_items 단위로 각각 다른 영업담당자를 지정할 수 있도록 구조 변경.
--
-- 변경 내용:
--   1. request_items.sales_manager 컬럼 추가
--   2. requests.sales_manager 컬럼 제거 (SQLite 3.35.0+ DROP COLUMN 지원)
--   3. request_templates.sales_manager 컬럼 제거 (items_json에 포함됨)
--
-- 주의:
--   기존 requests/request_templates 데이터가 있는 경우
--   sales_manager 값이 유실된다 (운영 전 마이그레이션이므로 허용).
--   request_items.sales_manager DEFAULT ''로 설정되어 기존 행은 빈 문자열로 채워진다.

-- 1. request_items에 sales_manager 컬럼 추가
--    DEFAULT '': 기존 행을 빈 문자열로 초기화
--    NOT NULL: 이후 INSERT 시 반드시 값 필요
ALTER TABLE request_items ADD COLUMN sales_manager TEXT NOT NULL DEFAULT '';

-- 2. requests 테이블에서 sales_manager 컬럼 제거
--    (SQLite 3.35.0 이상에서 지원 — 현재 환경: 3.49.2)
ALTER TABLE requests DROP COLUMN sales_manager;

-- 3. request_templates 테이블에서 sales_manager 컬럼 제거
--    (영업담당자는 이제 items_json 내 각 항목에 포함됨)
ALTER TABLE request_templates DROP COLUMN sales_manager;
