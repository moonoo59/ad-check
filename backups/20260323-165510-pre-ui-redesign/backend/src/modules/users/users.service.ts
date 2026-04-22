/**
 * 사용자 관리 서비스
 *
 * 관리자가 사용자를 추가/수정/비활성화할 수 있도록 한다.
 * 비밀번호 변경은 본인만 가능한 changePassword와 관리자 리셋 2가지 경로.
 *
 * 주의:
 * - username은 변경 불가 (로그인 ID, 고유값)
 * - 비밀번호는 bcryptjs로 해시하여 저장
 * - is_active=0 처리(소프트 삭제)만 허용, 물리 삭제 없음 (이력 보존)
 */

import db from '../../config/database';
import bcrypt from 'bcryptjs';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateUserDto {
  username: string;
  display_name: string;
  role: 'admin' | 'tech_team' | 'ad_team';
  password: string;
}

export interface UpdateUserDto {
  display_name?: string;
  role?: 'admin' | 'tech_team' | 'ad_team';
  is_active?: number;
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 사용자 목록 조회
 * 비활성 사용자 포함 여부 선택 가능
 */
export function getUsers(includeInactive = true): UserRow[] {
  const sql = includeInactive
    ? `SELECT id, username, display_name, role, is_active, created_at, updated_at FROM users ORDER BY id`
    : `SELECT id, username, display_name, role, is_active, created_at, updated_at FROM users WHERE is_active = 1 ORDER BY id`;
  return db.prepare(sql).all() as UserRow[];
}

/**
 * 사용자 단건 조회
 */
export function getUserById(userId: number): UserRow | undefined {
  return db.prepare(`
    SELECT id, username, display_name, role, is_active, created_at, updated_at FROM users WHERE id = ?
  `).get(userId) as UserRow | undefined;
}

/**
 * 신규 사용자 생성
 *
 * @param dto 사용자 정보 (username, display_name, role, password)
 * @param createdBy 생성한 관리자 ID
 * @returns 생성된 사용자 ID 또는 null (username 중복 시)
 */
export function createUser(dto: CreateUserDto, createdBy: number): number | null {
  // username 중복 확인
  const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(dto.username);
  if (existing) return null;

  // 비밀번호 해시
  const passwordHash = bcrypt.hashSync(dto.password, 10);
  const now = new Date().toISOString();

  const result = db.transaction(() => {
    const insertResult = db.prepare(`
      INSERT INTO users (username, display_name, role, is_active, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `).run(dto.username.trim(), dto.display_name.trim(), dto.role, passwordHash, now, now);

    const newUserId = insertResult.lastInsertRowid as number;

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'user_create', 'users', ?, ?, datetime('now', 'localtime'))
    `).run(createdBy, newUserId, JSON.stringify({ username: dto.username, role: dto.role }));

    return newUserId;
  })();

  return result as number;
}

/**
 * 사용자 정보 수정 (display_name, role, is_active)
 * username은 변경 불가
 *
 * @param userId 수정 대상 사용자 ID
 * @param dto 수정할 필드
 * @param updatedBy 수정한 관리자 ID
 */
export function updateUser(userId: number, dto: UpdateUserDto, updatedBy: number): boolean {
  const user = getUserById(userId);
  if (!user) return false;

  const fields: string[] = [];
  const values: (string | number)[] = [];
  const now = new Date().toISOString();

  if (dto.display_name !== undefined) {
    fields.push('display_name = ?');
    values.push(dto.display_name.trim());
  }
  if (dto.role !== undefined) {
    fields.push('role = ?');
    values.push(dto.role);
  }
  if (dto.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(dto.is_active);
  }

  if (fields.length === 0) return true; // 변경사항 없음

  fields.push('updated_at = ?');
  values.push(now);
  values.push(userId);

  db.transaction(() => {
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'user_update', 'users', ?, ?, datetime('now', 'localtime'))
    `).run(updatedBy, userId, JSON.stringify(dto));
  })();

  return true;
}

/**
 * 관리자가 사용자 비밀번호 초기화
 * 본인 비밀번호 변경은 auth.service의 changePassword 사용
 *
 * @param userId 대상 사용자 ID
 * @param newPassword 새 비밀번호 (평문)
 * @param resetBy 초기화한 관리자 ID
 */
export function resetPassword(userId: number, newPassword: string, resetBy: number): boolean {
  const user = getUserById(userId);
  if (!user) return false;

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(passwordHash, now, userId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'user_password_reset', 'users', ?, ?, datetime('now', 'localtime'))
    `).run(resetBy, userId, JSON.stringify({ target_username: user.username }));
  })();

  return true;
}
