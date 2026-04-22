-- 비밀번호 자가 초기화 기능을 위한 연락처 컬럼 추가
--
-- 사용자가 비밀번호를 잊었을 때 등록된 전화번호 또는 이메일로
-- 본인 확인 후 직접 비밀번호를 재설정할 수 있도록 한다.
--
-- 두 컬럼 모두 선택값(NULL 허용).
-- 비밀번호 초기화를 원하는 사용자는 가입 시 최소 하나를 입력해야 한다.

-- users 테이블에 연락처 컬럼 추가
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN email TEXT;

-- user_registrations 테이블에도 추가 (가입 신청 → 승인 시 users로 복사됨)
ALTER TABLE user_registrations ADD COLUMN phone TEXT;
ALTER TABLE user_registrations ADD COLUMN email TEXT;
