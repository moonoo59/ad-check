/**
 * 인증 라우터
 *
 * POST /api/auth/login     - 로그인 (세션 생성)
 * POST /api/auth/logout    - 로그아웃 (세션 파괴)
 * GET  /api/auth/me        - 현재 로그인한 사용자 정보
 * POST /api/auth/register  - 회원가입 신청 (공개 엔드포인트)
 *
 * 인증 방식: express-session (서버 사이드 세션, MemoryStore)
 * 단일 PC 내부망 환경에서는 MemoryStore로 충분하다.
 */
import { Router, Request, Response, IRouter } from 'express';
import { login, changePassword, selfResetPassword } from './auth.service';
import { sendSuccess, sendError } from '../../common/response';
import { requireAuth, getCurrentUser } from '../../common/auth.middleware';
import db from '../../config/database';
import { utcNow } from '../../common/datetime';
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordLoginFailure,
} from '../../common/login-rate-limit';
import { createRegistration } from '../registrations/registrations.service';

// 회원가입 신청 IP 기반 횟수 제한 (로그인 rate-limiter와 별도 관리)
// 동일 IP에서 10분 내 5회 초과 시 차단
const REGISTER_WINDOW_MS = 10 * 60 * 1000;
const REGISTER_MAX_PER_IP = 5;
const REGISTER_BLOCK_MS = 10 * 60 * 1000;
const registerAttempts = new Map<string, { timestamps: number[]; blockedUntil: number }>();

function checkRegisterRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const key = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const bucket = registerAttempts.get(key) ?? { timestamps: [], blockedUntil: 0 };

  // 만료된 항목 정리
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts <= REGISTER_WINDOW_MS);
  if (bucket.blockedUntil <= now) bucket.blockedUntil = 0;

  if (bucket.blockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.blockedUntil - now) / 1000) };
  }

  bucket.timestamps.push(now);
  if (bucket.timestamps.length > REGISTER_MAX_PER_IP) {
    bucket.blockedUntil = now + REGISTER_BLOCK_MS;
    registerAttempts.set(key, bucket);
    return { allowed: false, retryAfterSec: Math.ceil(REGISTER_BLOCK_MS / 1000) };
  }

  registerAttempts.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
}

const router: IRouter = Router();

/**
 * POST /api/auth/login
 * 로그인: 계정명 + 비밀번호 검증 후 세션 생성
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };

  // 입력값 검증
  if (!username || typeof username !== 'string' || username.trim() === '') {
    sendError(res, '계정명을 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }
  if (!password || typeof password !== 'string' || password.trim() === '') {
    sendError(res, '비밀번호를 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }

  const normalizedUsername = username.trim();
  const clientIp = req.ip ?? '';
  const rateLimit = checkLoginRateLimit(clientIp, normalizedUsername);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSec));
    sendError(res, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.', 429, 'LOGIN_RATE_LIMITED');
    return;
  }

  const user = await login(normalizedUsername, password);
  if (!user) {
    recordLoginFailure(clientIp, normalizedUsername);
    // 보안: 어떤 이유로 실패했는지 구체적으로 알려주지 않음
    sendError(res, '계정명 또는 비밀번호가 올바르지 않습니다.', 401, 'LOGIN_FAILED');
    return;
  }

  clearLoginRateLimit(clientIp, normalizedUsername);

  req.session.regenerate((sessionError) => {
    if (sessionError) {
      console.error('[Auth] 세션 재생성 오류:', sessionError);
      sendError(res, '로그인 세션 생성에 실패했습니다.', 500, 'LOGIN_FAILED');
      return;
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.displayName = user.display_name;
    req.session.username = user.username;
    req.session.canCopy = user.can_copy;
    req.session.canViewStats = user.can_view_stats;
    req.session.assignedChannels = user.assigned_channels;

    req.session.save((saveError) => {
      if (saveError) {
        console.error('[Auth] 세션 저장 오류:', saveError);
        sendError(res, '로그인 세션 저장에 실패했습니다.', 500, 'LOGIN_FAILED');
        return;
      }

      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, created_at)
        VALUES (?, 'user_login', 'users', ?, ?, ?)
      `).run(user.id, user.id, req.ip ?? '', utcNow());

      sendSuccess(
        res,
        {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          can_copy: user.can_copy,
          can_view_stats: user.can_view_stats,
          assigned_channels: user.assigned_channels,
        },
        '로그인 성공',
      );
    });
  });
});

/**
 * POST /api/auth/logout
 * 로그아웃: 세션 파괴
 */
router.post('/logout', requireAuth, (req: Request, res: Response): void => {
  const userId = req.session.userId;

  // 감사 로그 기록 (세션 파괴 전에)
  if (userId) {
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, created_at)
      VALUES (?, 'user_logout', 'users', ?, ?, ?)
    `).run(userId, userId, req.ip ?? '', utcNow());
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] 세션 파괴 오류:', err);
      sendError(res, '로그아웃 처리 중 오류가 발생했습니다.', 500, 'LOGOUT_FAILED');
      return;
    }
    // 쿠키 제거
    res.clearCookie('connect.sid');
    sendSuccess(res, null, '로그아웃 완료');
  });
});

/**
 * GET /api/auth/me
 * 현재 로그인한 사용자 정보 반환
 * 프론트엔드에서 페이지 새로고침 후 세션 복원 시 사용
 */
router.get('/me', requireAuth, (req: Request, res: Response): void => {
  const user = getCurrentUser(req);
  sendSuccess(res, {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    role: user.role,
    can_copy: req.session.canCopy ?? 0,
    can_view_stats: req.session.canViewStats ?? 0,
    assigned_channels: user.assignedChannels ?? '[]',
  });
});

/**
 * POST /api/auth/register
 * 회원가입 신청 (공개 엔드포인트 — 인증 불필요)
 * body: { username, display_name, role, password, assigned_channels? }
 *
 * 신청 후 관리자 승인이 필요하며, 승인 전까지 로그인 불가.
 * 공개 신청 가능한 역할은 ad_team, tech_team 뿐이다.
 * IP 기반 신청 횟수 제한 적용 (10분 내 5회 초과 시 10분 차단).
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const clientIp = req.ip ?? '';
  const rateLimit = checkRegisterRateLimit(clientIp);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSec));
    sendError(res, '신청 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.', 429, 'REGISTER_RATE_LIMITED');
    return;
  }

  const body = req.body as {
    username?: string;
    display_name?: string;
    role?: string;
    password?: string;
    assigned_channels?: unknown;
    phone?: string;
    email?: string;
  };

  // 입력값 검증
  if (!body.username || typeof body.username !== 'string' || body.username.trim() === '') {
    sendError(res, '아이디를 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }
  if (!body.display_name || typeof body.display_name !== 'string' || body.display_name.trim() === '') {
    sendError(res, '이름을 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }
  if (!body.role || !['tech_team', 'ad_team'].includes(body.role)) {
    sendError(res, '회원가입 신청은 채널 담당자 또는 대표 담당자만 가능합니다.', 400, 'INVALID_INPUT');
    return;
  }
  if (!body.password || typeof body.password !== 'string' || body.password.length < 6) {
    sendError(res, '비밀번호는 6자 이상이어야 합니다.', 400, 'INVALID_INPUT');
    return;
  }

  // assigned_channels: 배열이 아니면 빈 배열로 처리
  const assignedChannels: string[] = Array.isArray(body.assigned_channels)
    ? (body.assigned_channels as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];

  const result = await createRegistration({
    username: body.username,
    display_name: body.display_name,
    role: body.role as 'tech_team' | 'ad_team',
    password: body.password,
    assigned_channels: assignedChannels,
    phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
    email: typeof body.email === 'string' ? body.email.trim() || null : null,
  });

  if (result === 'duplicate_username') {
    sendError(res, '이미 사용 중인 아이디입니다.', 409, 'DUPLICATE_USERNAME');
    return;
  }

  sendSuccess(res, { registration_id: result }, '회원가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.', 201);
});

/**
 * POST /api/auth/reset-password
 * 비밀번호 자가 초기화 (공개 엔드포인트 — 로그인 불필요)
 * body: { username, contact, new_password, new_password_confirm }
 *
 * contact: 사용자가 등록한 전화번호 또는 이메일 중 하나와 일치해야 함.
 * IP 기반 횟수 제한 적용 (5분 내 5회 초과 시 10분 차단).
 */

// 비밀번호 초기화 rate-limit (username 열거 공격 방지)
const RESET_WINDOW_MS = 5 * 60 * 1000;
const RESET_MAX_PER_IP = 5;
const RESET_BLOCK_MS = 10 * 60 * 1000;
const resetAttempts = new Map<string, { timestamps: number[]; blockedUntil: number }>();

function checkResetRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const key = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const bucket = resetAttempts.get(key) ?? { timestamps: [], blockedUntil: 0 };

  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts <= RESET_WINDOW_MS);
  if (bucket.blockedUntil <= now) bucket.blockedUntil = 0;

  if (bucket.blockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.blockedUntil - now) / 1000) };
  }

  bucket.timestamps.push(now);
  if (bucket.timestamps.length > RESET_MAX_PER_IP) {
    bucket.blockedUntil = now + RESET_BLOCK_MS;
    resetAttempts.set(key, bucket);
    return { allowed: false, retryAfterSec: Math.ceil(RESET_BLOCK_MS / 1000) };
  }

  resetAttempts.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
}

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const clientIp = req.ip ?? '';
  const rateLimit = checkResetRateLimit(clientIp);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSec));
    sendError(res, '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', 429, 'RESET_RATE_LIMITED');
    return;
  }

  const { username, contact, new_password, new_password_confirm } = req.body as {
    username?: string;
    contact?: string;
    new_password?: string;
    new_password_confirm?: string;
  };

  if (!username || typeof username !== 'string' || username.trim() === '') {
    sendError(res, '계정명을 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }
  if (!contact || typeof contact !== 'string' || contact.trim() === '') {
    sendError(res, '등록된 전화번호 또는 이메일을 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }
  if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
    sendError(res, '새 비밀번호는 6자 이상이어야 합니다.', 400, 'INVALID_INPUT');
    return;
  }
  if (!new_password_confirm || new_password !== new_password_confirm) {
    sendError(res, '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.', 400, 'INVALID_INPUT');
    return;
  }

  const result = await selfResetPassword(username.trim(), contact.trim(), new_password);

  if (result === 'not_found' || result === 'contact_mismatch') {
    // 보안: 어느 쪽 실패인지 외부에 노출하지 않음
    sendError(res, '계정명 또는 연락처 정보가 일치하지 않습니다.', 401, 'RESET_FAILED');
    return;
  }
  if (result === 'no_contact') {
    sendError(res, '이 계정에는 등록된 연락처 정보가 없습니다. 관리자에게 문의해주세요.', 400, 'NO_CONTACT');
    return;
  }

  sendSuccess(res, null, '비밀번호가 초기화되었습니다. 새 비밀번호로 로그인해주세요.');
});

/**
 * POST /api/auth/change-password
 * 본인 비밀번호 변경 (현재 비밀번호 확인 필수)
 * body: { current_password, new_password }
 */
router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getCurrentUser(req);
  const { current_password, new_password, new_password_confirm } = req.body as {
    current_password?: string;
    new_password?: string;
    new_password_confirm?: string;
  };

  if (!current_password || typeof current_password !== 'string') {
    sendError(res, '현재 비밀번호를 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }
  if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
    sendError(res, '새 비밀번호는 6자 이상이어야 합니다.', 400, 'INVALID_INPUT');
    return;
  }
  // 프론트 우회 시에도 확인 비밀번호 일치 여부를 백엔드에서 검증
  if (!new_password_confirm || new_password !== new_password_confirm) {
    sendError(res, '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.', 400, 'INVALID_INPUT');
    return;
  }
  if (current_password === new_password) {
    sendError(res, '새 비밀번호는 현재 비밀번호와 달라야 합니다.', 400, 'INVALID_INPUT');
    return;
  }

  const result = await changePassword(user.id, current_password, new_password);

  if (result === 'wrong_password') {
    sendError(res, '현재 비밀번호가 올바르지 않습니다.', 401, 'WRONG_PASSWORD');
    return;
  }
  if (result === 'not_found') {
    sendError(res, '사용자를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    return;
  }

  // 비밀번호 변경 성공 후 세션 갱신 (session fixation 방지)
  // 기존 세션이 탈취되어 있어도 새 세션 ID로 교체되므로 공격자 세션이 무효화됨
  req.session.regenerate((err) => {
    if (err) {
      // regenerate 실패는 치명적이지 않으므로 로그만 남기고 성공 응답 반환
      console.error('[Auth] 비밀번호 변경 후 세션 재생성 실패:', err);
    }
    sendSuccess(res, null, '비밀번호가 변경되었습니다. 다시 로그인해주세요.');
  });
});

export default router;
