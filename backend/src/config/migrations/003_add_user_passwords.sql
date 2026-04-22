-- 사용자 비밀번호 해시 컬럼 추가
--
-- 로그인 기능 구현을 위해 password_hash 컬럼을 추가한다.
-- bcrypt 해시로 저장하며 60자 내외이다.
-- 실제 사용자 시딩은 database.ts의 seedDefaultUsers()에서 처리한다.
-- (SQL에서는 bcrypt 해싱이 불가능하므로 TypeScript로 처리)

ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
