/**
 * 인증 및 권한 미들웨어
 *
 * requireAuth  : 로그인 여부만 확인 (모든 인증된 사용자)
 * requireRole  : 특정 역할을 가진 사용자만 허용
 * getCurrentUser: 세션에서 사용자 정보를 추출하는 헬퍼
 *
 * 세션은 express-session의 req.session에 저장된다.
 * types/session.d.ts에서 SessionData를 확장하여 userId, userRole 등을 선언.
 */
import { Request, Response, NextFunction } from 'express';
import { sendError } from './response';
import db from '../config/database';

interface SessionUserRow {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: number;
  can_copy: number;
  can_view_stats: number;
  assigned_channels: string;
}

function rejectAndClearSession(
  req: Request,
  res: Response,
  message: string,
  errorCode: string,
): void {
  req.session.destroy((error) => {
    if (error) {
      console.error('[Auth] 세션 정리 오류:', error);
    }
    res.clearCookie('connect.sid');
    sendError(res, message, 401, errorCode);
  });
}

/**
 * 로그인 여부 확인 미들웨어
 * 세션에 userId가 없으면 401 응답.
 * 요청 시점마다 users 테이블을 재조회해 역할/활성 상태를 최신값으로 동기화한다.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    sendError(res, '로그인이 필요합니다.', 401, 'UNAUTHORIZED');
    return;
  }

  const user = db.prepare(`
    SELECT id, username, display_name, role, is_active, can_copy, can_view_stats, assigned_channels
    FROM users
    WHERE id = ?
  `).get(req.session.userId) as SessionUserRow | undefined;

  if (!user || !user.is_active) {
    rejectAndClearSession(req, res, '계정 상태가 변경되어 다시 로그인해야 합니다.', 'SESSION_INVALIDATED');
    return;
  }

  req.session.userRole = user.role;
  req.session.displayName = user.display_name;
  req.session.username = user.username;
  req.session.assignedChannels = user.assigned_channels;
  // admin은 컬럼 값과 무관하게 항상 모든 권한 보유
  const isAdmin = user.role === 'admin';
  req.session.canCopy = isAdmin ? 1 : user.can_copy;
  req.session.canViewStats = isAdmin ? 1 : user.can_view_stats;

  next();
}

/**
 * 역할 기반 접근 제어 미들웨어
 *
 * 사용 예시:
 *   router.post('/channels', requireAuth, requireRole('admin'), handler)
 *   router.get('/requests', requireAuth, requireRole('tech_team', 'admin'), handler)
 *
 * @param roles 허용할 역할 목록 (하나 이상)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // requireAuth 이후에 호출되어야 하므로 userId 존재를 가정
    if (!req.session.userId) {
      sendError(res, '로그인이 필요합니다.', 401, 'UNAUTHORIZED');
      return;
    }

    if (!roles.includes(req.session.userRole ?? '')) {
      sendError(
        res,
        `이 작업은 [${roles.join(', ')}] 역할만 수행할 수 있습니다.`,
        403,
        'FORBIDDEN',
      );
      return;
    }

    next();
  };
}

/**
 * 기능별 권한 확인 미들웨어
 *
 * 세션에 저장된 권한 값을 확인한다. requireAuth 이후에 사용해야 한다.
 * admin 역할은 requireAuth에서 이미 모든 권한을 1로 설정하므로 항상 통과한다.
 *
 * 사용 예시:
 *   router.post('/approve', requireAuth, requirePermission('canCopy'), handler)
 *
 * @param permission 세션에 저장된 권한 키 이름
 */
export function requirePermission(permission: 'canCopy' | 'canViewStats') {
  const labels: Record<string, string> = {
    canCopy: '파일 전송(복사)',
    canViewStats: '통계 조회',
  };
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session.userId) {
      sendError(res, '로그인이 필요합니다.', 401, 'UNAUTHORIZED');
      return;
    }
    if (!req.session[permission]) {
      sendError(
        res,
        `${labels[permission] ?? permission} 권한이 없습니다. 관리자에게 문의하세요.`,
        403,
        'PERMISSION_DENIED',
      );
      return;
    }
    next();
  };
}

/**
 * 현재 로그인한 사용자 정보를 세션에서 추출한다.
 * requireAuth 이후에 호출하면 항상 값이 보장된다.
 */
export function getCurrentUser(req: Request) {
  return {
    id: req.session.userId as number,
    role: req.session.userRole as string,
    displayName: req.session.displayName as string,
    username: req.session.username as string,
    assignedChannels: req.session.assignedChannels as string,
    canCopy: req.session.canCopy === 1,
  };
}
