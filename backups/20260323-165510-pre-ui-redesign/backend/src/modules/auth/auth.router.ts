/**
 * 인증 라우터
 *
 * POST /api/auth/login  - 로그인 (세션 생성)
 * POST /api/auth/logout - 로그아웃 (세션 파괴)
 * GET  /api/auth/me     - 현재 로그인한 사용자 정보
 *
 * 인증 방식: express-session (서버 사이드 세션, MemoryStore)
 * 단일 PC 내부망 환경에서는 MemoryStore로 충분하다.
 */
import { Router, Request, Response, IRouter } from 'express';
import { login, changePassword } from './auth.service';
import { sendSuccess, sendError } from '../../common/response';
import { requireAuth, getCurrentUser } from '../../common/auth.middleware';
import db from '../../config/database';

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

  // 이미 로그인된 상태라면 기존 세션 파괴 후 재로그인
  if (req.session.userId) {
    req.session.destroy(() => {});
  }

  const user = await login(username.trim(), password);
  if (!user) {
    // 보안: 어떤 이유로 실패했는지 구체적으로 알려주지 않음
    sendError(res, '계정명 또는 비밀번호가 올바르지 않습니다.', 401, 'LOGIN_FAILED');
    return;
  }

  // 세션에 사용자 정보 저장
  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.displayName = user.display_name;
  req.session.username = user.username;

  // 감사 로그 기록
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, created_at)
    VALUES (?, 'user_login', 'users', ?, ?, datetime('now', 'localtime'))
  `).run(user.id, user.id, req.ip ?? '');

  sendSuccess(
    res,
    {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    },
    '로그인 성공',
  );
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
      VALUES (?, 'user_logout', 'users', ?, ?, datetime('now', 'localtime'))
    `).run(userId, userId, req.ip ?? '');
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
  });
});

/**
 * POST /api/auth/change-password
 * 본인 비밀번호 변경 (현재 비밀번호 확인 필수)
 * body: { current_password, new_password }
 */
router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getCurrentUser(req);
  const { current_password, new_password } = req.body as {
    current_password?: string;
    new_password?: string;
  };

  if (!current_password || typeof current_password !== 'string') {
    sendError(res, '현재 비밀번호를 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }
  if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
    sendError(res, '새 비밀번호는 6자 이상이어야 합니다.', 400, 'INVALID_INPUT');
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

  sendSuccess(res, null, '비밀번호가 변경되었습니다.');
});

export default router;
