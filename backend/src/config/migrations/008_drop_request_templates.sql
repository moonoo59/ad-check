-- Migration 008: 미사용 request_templates 테이블 제거
--
-- 배경:
--   템플릿 기능은 기획에서 제외되었고, 실제 서비스/라우터/프론트 코드가 존재하지 않는다.
--   운영 중 사용되지 않는 테이블을 정리해 스키마 복잡도를 줄인다.

DROP TABLE IF EXISTS request_templates;
