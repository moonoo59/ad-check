/**
 * 인증 서비스
 *
 * 로그인 시 username으로 사용자를 조회하고 bcrypt로 비밀번호를 검증한다.
 * 성공 시 세션에 저장할 사용자 정보 객체를 반환한다.
 *
 * 주의: password_hash가 빈 문자열인 사용자(마이그레이션 전 생성)는
 *       로그인이 불가능하다. 관리자 시딩 후 정상 동작한다.
 */
import bcrypt from 'bcryptjs';
import db from '../../config/database';
import { utcNow } from '../../common/datetime';

// 로그인 결과로 반환할 사용자 정보 타입
export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

// DB에서 조회되는 사용자 행 타입
interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: string;
  password_hash: string;
  is_active: number;
}

/**
 * 로그인 처리
 *
 * @param username 로그인 계정명
 * @param password 평문 비밀번호
 * @returns 인증 성공 시 AuthUser, 실패 시 null
 */
export async function login(username: string, password: string): Promise<AuthUser | null> {
  // 활성 사용자만 허용 (is_active=0은 로그인 차단)
  const user = db
    .prepare('SELECT id, username, display_name, role, password_hash, is_active FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;

  if (!user) {
    // 보안: 사용자 존재 여부를 외부에 노출하지 않기 위해 동일한 에러 반환
    return null;
  }

  if (!user.is_active) {
    // 비활성화된 계정
    return null;
  }

  if (!user.password_hash) {
    // 비밀번호가 설정되지 않은 계정 (시딩 전 상태)
    return null;
  }

  // bcrypt 비밀번호 검증
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
  };
}

/**
 * 본인 비밀번호 변경
 *
 * 현재 비밀번호 확인 후 새 비밀번호로 교체.
 * 관리자 초기화(reset-password)와 달리 기존 비밀번호 검증 필수.
 *
 * @param userId 본인 사용자 ID
 * @param currentPassword 현재 비밀번호 (평문)
 * @param newPassword 새 비밀번호 (평문)
 * @returns 성공 여부 ('ok' | 'wrong_password' | 'not_found')
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<'ok' | 'wrong_password' | 'not_found'> {
  const user = db.prepare(
    `SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1`,
  ).get(userId) as { id: number; password_hash: string } | undefined;

  if (!user) return 'not_found';

  // 현재 비밀번호 검증
  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValid) return 'wrong_password';

  const newHash = await bcrypt.hash(newPassword, 10);
  const now = utcNow();

  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(newHash, now, userId);
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'user_password_change', 'users', ?, ?)
    `).run(userId, userId, now);
  })();

  return 'ok';
}

/**
 * 무인증 비밀번호 초기화 (공용 계정용)
 *
 * 로그인 없이 역할(username) 지정만으로 비밀번호를 무조건 덮어씁니다.
 *
 * @param username  계정명 ('admin' 또는 'ad_team')
 * @param newPassword 새 비밀번호 (평문)
 * @returns 'ok' | 'not_found'
 */
export async function directResetPassword(
  username: string,
  newPassword: string,
): Promise<'ok' | 'not_found'> {
  const user = db.prepare(`
    SELECT id FROM users WHERE username = ? AND is_active = 1
  `).get(username) as { id: number } | undefined;

  if (!user) return 'not_found';

  const newHash = await bcrypt.hash(newPassword, 10);
  const now = utcNow();

  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(newHash, now, user.id);
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'user_direct_password_reset', 'users', ?, ?)
    `).run(user.id, user.id, now);
  })();

  return 'ok';
}

/**
 * ID로 사용자 조회 (세션 복원용)
 *
 * @param userId 사용자 ID
 * @returns AuthUser 또는 null (비활성/삭제 시)
 */
export function getUserById(userId: number): AuthUser | null {
  const user = db
    .prepare('SELECT id, username, display_name, role, is_active FROM users WHERE id = ?')
    .get(userId) as (AuthUser & { is_active: number }) | undefined;

  if (!user || !user.is_active) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
  };
}
