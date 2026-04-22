-- Migration 007: resend_logs 테이블 추가
-- 완료(done) 상태의 요청에서 파일이 삭제된 경우 재전송 이력을 기록한다.
-- 새 요청을 만들지 않고 기존 요청 기준으로 재복사를 실행하며,
-- 재전송 사유와 요청자 정보만 이 테이블에 별도 보관한다.
CREATE TABLE IF NOT EXISTS resend_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id        INTEGER NOT NULL,                        -- 재전송 대상 요청
  reason            TEXT    NOT NULL,                        -- 재전송 사유 (필수)
  requested_by      INTEGER NOT NULL,                        -- 재전송 요청자 ID
  requested_by_name TEXT    NOT NULL,                        -- 요청자 표시명 (비정규화 보관)
  created_at        TEXT    NOT NULL,                        -- 재전송 요청 일시
  FOREIGN KEY (request_id)   REFERENCES requests(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_resend_logs_request_id ON resend_logs(request_id);
