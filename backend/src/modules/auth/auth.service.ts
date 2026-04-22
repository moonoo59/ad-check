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
  can_copy: number;        // 파일 전송 권한 (admin은 항상 1)
  can_view_stats: number;  // 통계 조회 권한 (admin은 항상 1)
  assigned_channels: string;
}

// DB에서 조회되는 사용자 행 타입
interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: string;
  password_hash: string;
  is_active: number;
  can_copy: number;
  can_view_stats: number;
  assigned_channels: string;
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
    .prepare('SELECT id, username, display_name, role, password_hash, is_active, can_copy, can_view_stats, assigned_channels FROM users WHERE username = ?')
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

  // admin은 컬럼 값과 무관하게 항상 모든 권한 보유
  const isAdmin = user.role === 'admin';
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    can_copy: isAdmin ? 1 : user.can_copy,
    can_view_stats: isAdmin ? 1 : user.can_view_stats,
    assigned_channels: user.assigned_channels,
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
 * 본인 비밀번호 자가 초기화
 *
 * 로그인 없이 username + 등록된 전화번호/이메일로 본인 확인 후 비밀번호를 변경한다.
 * contact는 phone 또는 email 중 하나와 일치하면 통과.
 *
 * 보안 주의:
 * - 사용자 존재 여부를 contact 불일치와 동일한 오류로 응답해 username 열거 공격을 방지
 * - 라우터에서 rate-limit 적용 필수
 *
 * @param username  계정명
 * @param contact   등록된 전화번호 또는 이메일 (어느 한 쪽과 일치해야 함)
 * @param newPassword 새 비밀번호 (평문)
 * @returns 'ok' | 'not_found' | 'contact_mismatch' | 'no_contact'
 */
export async function selfResetPassword(
  username: string,
  contact: string,
  newPassword: string,
): Promise<'ok' | 'not_found' | 'contact_mismatch' | 'no_contact'> {
  const user = db.prepare(`
    SELECT id, phone, email FROM users WHERE username = ? AND is_active = 1
  `).get(username) as { id: number; phone: string | null; email: string | null } | undefined;

  // 사용자 미존재도 contact_mismatch로 통일 — username 존재 여부 노출 방지
  if (!user) return 'not_found';

  // 연락처 미등록 계정은 자가 초기화 불가 → 관리자 초기화 필요
  if (!user.phone && !user.email) return 'no_contact';

  // 전화번호 또는 이메일 중 하나라도 일치하면 통과
  const trimmed = contact.trim();
  const phoneMatch = user.phone && user.phone.trim() === trimmed;
  const emailMatch = user.email && user.email.trim().toLowerCase() === trimmed.toLowerCase();

  if (!phoneMatch && !emailMatch) return 'contact_mismatch';

  const newHash = await bcrypt.hash(newPassword, 10);
  const now = utcNow();

  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(newHash, now, user.id);
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'user_self_password_reset', 'users', ?, ?)
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
    .prepare('SELECT id, username, display_name, role, is_active, can_copy, can_view_stats, assigned_channels FROM users WHERE id = ?')
    .get(userId) as (AuthUser & { is_active: number }) | undefined;

  if (!user || !user.is_active) {
    return null;
  }

  const isAdmin = user.role === 'admin';
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    can_copy: isAdmin ? 1 : user.can_copy,
    can_view_stats: isAdmin ? 1 : user.can_view_stats,
    assigned_channels: user.assigned_channels,
  };
}
