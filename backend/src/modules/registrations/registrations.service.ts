/**
 * 회원가입 신청 서비스
 *
 * 흐름:
 *   신청 → user_registrations(status=pending) 저장
 *   승인 → users 테이블 INSERT + status=approved
 *   반려 → status=rejected (이력 보존)
 *
 * 승인 권한:
 *   ad_team 신청  → tech_team, admin 승인 가능
 *   tech_team 신청 → admin만 승인 가능
 *   admin 신청    → admin만 승인 가능
 *
 * 주의:
 *   - username 중복 체크: users 테이블과 user_registrations(pending/approved) 양쪽 확인
 *   - assigned_channels는 JSON 배열 문자열로 저장, 반환 시 파싱
 */

import db from '../../config/database';
import bcrypt from 'bcryptjs';
import { utcNow } from '../../common/datetime';

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface RegistrationRow {
  id: number;
  username: string;
  display_name: string;
  role: string;
  assigned_channels: string;  // JSON 배열 문자열
  phone: string | null;
  email: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: number | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationWithReviewer extends RegistrationRow {
  reviewer_name: string | null;  // 처리한 관리자 표시명
}

export interface CreateRegistrationDto {
  username: string;
  display_name: string;
  role: 'tech_team' | 'ad_team';
  password: string;
  assigned_channels: string[];  // 문자열 배열
  phone?: string | null;        // 비밀번호 초기화용 전화번호 (선택)
  email?: string | null;        // 비밀번호 초기화용 이메일 (선택)
}

// 역할별 승인 가능한 신청 역할 목록
// tech_team은 ad_team 신청만, admin은 전체 처리 가능
const APPROVABLE_ROLES: Record<string, string[]> = {
  tech_team: ['ad_team'],
  admin: ['ad_team', 'tech_team', 'admin'],
};

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 회원가입 신청 등록 (비인증 공개 엔드포인트에서 호출)
 *
 * @returns 신청 ID 또는 오류 코드
 *   - 'duplicate_username': 이미 활성 계정 또는 대기 중인 신청 존재
 */
export async function createRegistration(
  dto: CreateRegistrationDto,
): Promise<number | 'duplicate_username'> {
  // 1. users 테이블에 같은 username 계정이 있는지 확인
  const existingUser = db.prepare(`SELECT id FROM users WHERE username = ?`).get(dto.username);
  if (existingUser) return 'duplicate_username';

  // 2. user_registrations에 동일 username으로 pending/approved 신청이 있는지 확인
  const existingReg = db.prepare(`
    SELECT id FROM user_registrations
    WHERE username = ? AND status IN ('pending', 'approved')
  `).get(dto.username);
  if (existingReg) return 'duplicate_username';

  // 3. 비밀번호 해시
  const passwordHash = await bcrypt.hash(dto.password, 10);
  const now = utcNow();

  const phone = dto.phone?.trim() || null;
  const email = dto.email?.trim().toLowerCase() || null;

  const result = db.prepare(`
    INSERT INTO user_registrations
      (username, display_name, role, password_hash, assigned_channels, phone, email, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    dto.username.trim(),
    dto.display_name.trim(),
    dto.role,
    passwordHash,
    JSON.stringify(dto.assigned_channels),
    phone,
    email,
    now,
    now,
  );

  return result.lastInsertRowid as number;
}

/**
 * 신청 목록 조회
 *
 * @param viewerRole 조회하는 사용자의 역할 (역할별 필터 적용)
 * @param status 상태 필터 (미지정 시 전체)
 */
export function getRegistrations(
  viewerRole: string,
  status?: string,
): RegistrationWithReviewer[] {
  // tech_team은 ad_team 신청만 조회 가능
  const approvableRoles = APPROVABLE_ROLES[viewerRole] ?? [];

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // 역할 필터 (admin은 전체, tech_team은 ad_team만)
  if (viewerRole !== 'admin') {
    const placeholders = approvableRoles.map(() => '?').join(', ');
    conditions.push(`r.role IN (${placeholders})`);
    params.push(...approvableRoles);
  }

  if (status) {
    conditions.push(`r.status = ?`);
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT
      r.id, r.username, r.display_name, r.role, r.assigned_channels,
      r.status, r.reviewed_by, r.reviewed_at, r.reject_reason,
      r.created_at, r.updated_at,
      u.display_name AS reviewer_name
    FROM user_registrations r
    LEFT JOIN users u ON r.reviewed_by = u.id
    ${where}
    ORDER BY r.created_at DESC
  `).all(...params) as RegistrationWithReviewer[];
}

/**
 * 대기 중인 신청 건수 조회 (GlobalNav 뱃지용)
 *
 * @param viewerRole 조회하는 사용자의 역할
 */
export function getPendingCount(viewerRole: string): number {
  const approvableRoles = APPROVABLE_ROLES[viewerRole] ?? [];
  if (approvableRoles.length === 0) return 0;

  if (viewerRole === 'admin') {
    const row = db.prepare(`
      SELECT COUNT(*) AS cnt FROM user_registrations WHERE status = 'pending'
    `).get() as { cnt: number };
    return row.cnt;
  }

  const placeholders = approvableRoles.map(() => '?').join(', ');
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt FROM user_registrations
    WHERE status = 'pending' AND role IN (${placeholders})
  `).get(...approvableRoles) as { cnt: number };
  return row.cnt;
}

/**
 * 단건 조회 (승인/반려 전 상태 확인용)
 */
export function getRegistrationById(id: number): RegistrationRow | undefined {
  return db.prepare(`
    SELECT id, username, display_name, role, assigned_channels, phone, email,
           status, reviewed_by, reviewed_at, reject_reason, created_at, updated_at
    FROM user_registrations WHERE id = ?
  `).get(id) as RegistrationRow | undefined;
}

/**
 * 신청 승인
 *
 * 동작:
 * 1. 신청 상태 확인 (pending이어야 함)
 * 2. 승인자 역할 권한 확인
 * 3. users 테이블에 계정 INSERT
 * 4. user_registrations.status = 'approved'
 * 5. 감사 로그 기록
 *
 * @returns 성공 시 생성된 user ID,
 *   'not_found': 신청 없음,
 *   'not_pending': 이미 처리된 신청,
 *   'forbidden': 승인 권한 없음,
 *   'duplicate_username': users에 이미 동일 username 존재
 */
export async function approveRegistration(
  registrationId: number,
  approverId: number,
  approverRole: string,
): Promise<number | 'not_found' | 'not_pending' | 'forbidden' | 'duplicate_username'> {
  const reg = getRegistrationById(registrationId);
  if (!reg) return 'not_found';
  if (reg.status !== 'pending') return 'not_pending';

  // 역할 권한 확인
  const approvableRoles = APPROVABLE_ROLES[approverRole] ?? [];
  if (!approvableRoles.includes(reg.role)) return 'forbidden';

  // users 테이블 중복 확인 (비정상적 상황 방어)
  const existingUser = db.prepare(`SELECT id FROM users WHERE username = ?`).get(reg.username);
  if (existingUser) return 'duplicate_username';

  const now = utcNow();

  // 역할 기반 기본 권한
  const canCopy = reg.role === 'admin' || reg.role === 'tech_team' ? 1 : 0;
  const canViewStats = reg.role === 'admin' ? 1 : 0;

  // password_hash는 getRegistrationById에서 제외되어 있으므로 별도 조회 (phone/email도 함께)
  const pwRow = db.prepare(`SELECT password_hash, phone, email FROM user_registrations WHERE id = ?`).get(registrationId) as { password_hash: string; phone: string | null; email: string | null };

  const newUserId = db.transaction(() => {
    // users 테이블에 계정 생성 (phone/email도 같이 복사)
    const insertResult = db.prepare(`
      INSERT INTO users
        (username, display_name, role, is_active, password_hash, assigned_channels,
         can_copy, can_view_stats, phone, email, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reg.username,
      reg.display_name,
      reg.role,
      pwRow.password_hash,
      reg.assigned_channels,
      canCopy,
      canViewStats,
      pwRow.phone,
      pwRow.email,
      now,
      now,
    );
    const userId = insertResult.lastInsertRowid as number;

    // 신청 상태 업데이트
    db.prepare(`
      UPDATE user_registrations
      SET status = 'approved', reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(approverId, now, now, registrationId);

    // 감사 로그
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'registration_approved', 'users', ?, ?, ?)
    `).run(approverId, userId, JSON.stringify({
      registration_id: registrationId,
      username: reg.username,
      role: reg.role,
    }), now);

    return userId;
  })();

  return newUserId as number;
}

/**
 * 신청 반려
 *
 * @returns 성공 시 true,
 *   'not_found': 신청 없음,
 *   'not_pending': 이미 처리된 신청,
 *   'forbidden': 반려 권한 없음
 */
export function rejectRegistration(
  registrationId: number,
  approverId: number,
  approverRole: string,
  reason: string,
): true | 'not_found' | 'not_pending' | 'forbidden' {
  const reg = getRegistrationById(registrationId);
  if (!reg) return 'not_found';
  if (reg.status !== 'pending') return 'not_pending';

  // 역할 권한 확인
  const approvableRoles = APPROVABLE_ROLES[approverRole] ?? [];
  if (!approvableRoles.includes(reg.role)) return 'forbidden';

  const now = utcNow();

  db.transaction(() => {
    db.prepare(`
      UPDATE user_registrations
      SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, reject_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(approverId, now, reason.trim(), now, registrationId);

    // 감사 로그
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'registration_rejected', 'user_registrations', ?, ?, ?)
    `).run(approverId, registrationId, JSON.stringify({
      username: reg.username,
      role: reg.role,
      reason: reason.trim(),
    }), now);
  })();

  return true;
}
