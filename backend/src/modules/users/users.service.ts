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
import { utcNow } from '../../common/datetime';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: number;
  can_copy: number;           // 파일 탐색/선택/승인/복사 권한 (1=부여, 0=미부여)
  can_view_stats: number;     // 통계 대시보드 조회 권한 (1=부여, 0=미부여)
  assigned_channels: string;  // 담당채널 JSON 배열 문자열 (예: '["비즈","스포츠"]')
  phone: string | null;       // 전화번호 (비밀번호 자가 초기화용, 선택)
  email: string | null;       // 이메일 (비밀번호 자가 초기화용, 선택)
  created_at: string;
  updated_at: string;
}

export interface CreateUserDto {
  username: string;
  display_name: string;
  role: 'admin' | 'tech_team' | 'ad_team';
  password: string;
  can_copy?: number;           // 미지정 시 역할 기반 기본값 적용
  can_view_stats?: number;     // 미지정 시 역할 기반 기본값 적용
  assigned_channels?: string;  // JSON 배열 문자열 (미지정 시 '[]')
  phone?: string | null;       // 비밀번호 초기화용 전화번호 (선택)
  email?: string | null;       // 비밀번호 초기화용 이메일 (선택)
}

export interface UpdateUserDto {
  display_name?: string;
  role?: 'admin' | 'tech_team' | 'ad_team';
  is_active?: number;
  can_copy?: number;
  can_view_stats?: number;
  assigned_channels?: string;  // JSON 배열 문자열
  phone?: string | null;       // 비밀번호 초기화용 전화번호
  email?: string | null;       // 비밀번호 초기화용 이메일
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 사용자 목록 조회
 * 비활성 사용자 포함 여부 선택 가능
 */
export function getUsers(includeInactive = true): UserRow[] {
  const cols = 'id, username, display_name, role, is_active, can_copy, can_view_stats, assigned_channels, phone, email, created_at, updated_at';
  const sql = includeInactive
    ? `SELECT ${cols} FROM users ORDER BY id`
    : `SELECT ${cols} FROM users WHERE is_active = 1 ORDER BY id`;
  return db.prepare(sql).all() as UserRow[];
}

/**
 * 사용자 단건 조회
 */
export function getUserById(userId: number): UserRow | undefined {
  return db.prepare(`
    SELECT id, username, display_name, role, is_active, can_copy, can_view_stats, assigned_channels, phone, email, created_at, updated_at
    FROM users WHERE id = ?
  `).get(userId) as UserRow | undefined;
}

/**
 * 신규 사용자 생성
 *
 * @param dto 사용자 정보 (username, display_name, role, password)
 * @param createdBy 생성한 관리자 ID
 * @returns 생성된 사용자 ID 또는 null (username 중복 시)
 */
export async function createUser(dto: CreateUserDto, createdBy: number): Promise<number | null> {
  // username 중복 확인
  const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(dto.username);
  if (existing) return null;

  // 비밀번호 해시
  const passwordHash = await bcrypt.hash(dto.password, 10);
  const now = utcNow();

  // 역할 기반 기본 권한: admin/tech_team → can_copy=1, admin → can_view_stats=1
  const canCopy = dto.can_copy ?? (dto.role === 'admin' || dto.role === 'tech_team' ? 1 : 0);
  const canViewStats = dto.can_view_stats ?? (dto.role === 'admin' ? 1 : 0);
  const assignedChannels = dto.assigned_channels ?? '[]';
  const phone = dto.phone?.trim() || null;
  const email = dto.email?.trim().toLowerCase() || null;

  const result = db.transaction(() => {
    const insertResult = db.prepare(`
      INSERT INTO users
        (username, display_name, role, is_active, password_hash, can_copy, can_view_stats, assigned_channels, phone, email, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(dto.username.trim(), dto.display_name.trim(), dto.role, passwordHash, canCopy, canViewStats, assignedChannels, phone, email, now, now);

    const newUserId = insertResult.lastInsertRowid as number;

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'user_create', 'users', ?, ?, ?)
    `).run(createdBy, newUserId, JSON.stringify({ username: dto.username, role: dto.role }), now);

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
  const now = utcNow();

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
  if (dto.can_copy !== undefined) {
    fields.push('can_copy = ?');
    values.push(dto.can_copy);
  }
  if (dto.can_view_stats !== undefined) {
    fields.push('can_view_stats = ?');
    values.push(dto.can_view_stats);
  }
  if (dto.assigned_channels !== undefined) {
    fields.push('assigned_channels = ?');
    values.push(dto.assigned_channels);
  }
  if (dto.phone !== undefined) {
    fields.push('phone = ?');
    values.push(dto.phone?.trim() || null as unknown as string);
  }
  if (dto.email !== undefined) {
    fields.push('email = ?');
    values.push(dto.email?.trim().toLowerCase() || null as unknown as string);
  }

  if (fields.length === 0) return true; // 변경사항 없음

  fields.push('updated_at = ?');
  values.push(now);
  values.push(userId);

  db.transaction(() => {
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'user_update', 'users', ?, ?, ?)
    `).run(updatedBy, userId, JSON.stringify(dto), now);
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
export async function resetPassword(userId: number, newPassword: string, resetBy: number): Promise<boolean> {
  const user = getUserById(userId);
  if (!user) return false;

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const now = utcNow();

  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(passwordHash, now, userId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'user_password_reset', 'users', ?, ?, ?)
    `).run(resetBy, userId, JSON.stringify({ target_username: user.username }), now);
  })();

  return true;
}
