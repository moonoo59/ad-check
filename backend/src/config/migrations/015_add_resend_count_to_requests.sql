-- Migration 015: requests 테이블에 resend_count 컬럼 추가
-- 사용자가 파일 삭제 후 재전송을 요청한 횟수를 기록한다.
ALTER TABLE requests ADD COLUMN resend_count INTEGER NOT NULL DEFAULT 0;
